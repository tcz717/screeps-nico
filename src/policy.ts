import { AI_CONFIG } from "config";
import { Corps } from "corps";
import _, { Dictionary } from "lodash";
import { isEnergyContainer, isLoadableContainer, isStorable, isStorage, PRIORITY_HIGH, PRIORITY_LOW, PRIORITY_NORMAL, getResourceAmount, getResourceCapacity, isLoadable } from "task";

function calcBestWorker(corps: Corps): BodyPartConstant[] {
    const basic = [WORK, CARRY, MOVE];
    if (corps.getCreepInRole(Role.Worker).length == 0)
        return basic;
    const count = _.clamp(_.floor(corps.baseRoom.energyCapacityAvailable / _.sumBy(basic, part => BODYPART_COST[part])), 1, 3);
    return _.flatten(_.times(count, _.constant(basic)));
}
function calcBestMiner(corps: Corps): BodyPartConstant[] {
    const basic = [WORK, CARRY, MOVE];
    const count = _.clamp(_.floor(corps.baseRoom.energyCapacityAvailable / _.sumBy(basic, part => BODYPART_COST[part])), 1, 5);
    return _.flatten(_.times(count, _.constant(basic)));
}
function calcBestCarrier(corps: Corps): BodyPartConstant[] {
    const basic = [CARRY, CARRY, MOVE];
    const count = _.clamp(_.floor(corps.baseRoom.energyCapacityAvailable / _.sumBy(basic, part => BODYPART_COST[part])), 1, 2);
    return _.flatten(_.times(count, _.constant(basic)));
}

const RegularMaintain: string[] = [STRUCTURE_ROAD, STRUCTURE_CONTAINER];

type Policy = (corps: Corps) => void;
export type PolicySet = Dictionary<Policy>;

export const DefaultPolicySet: PolicySet = {
    SpawnWorker: (corps: Corps) => {
        const controller = corps.baseRoom.controller;
        const expectedWorker = _.clamp(
            corps.memory.aveQueueLength / AI_CONFIG.workQueueRatio
            + (controller && controller.level || 0) / AI_CONFIG.upgradeTaskRatio,
            AI_CONFIG.minWorker, AI_CONFIG.maxWorker)
        const workerNum: number = _.get(corps.roles, Role.Worker, []).length;

        if (workerNum < expectedWorker) {
            const count = expectedWorker - workerNum;
            corps.scheduler.pushTask({
                type: TaskType.SpawnCreep,
                priority: PRIORITY_HIGH,
                body: calcBestWorker(corps),
                role: Role.Worker,
                corps: corps.name,
                tag: Role.Worker,
                timeout: Game.time + 10,
            }, count);
        }
    },
    SpawnMiner: (corps: Corps) => {
        if (_(corps.baseRoom.find(FIND_STRUCTURES)).findIndex(isStorable) < 0)
            return;
        const minerNum: number = corps.getCreepInRole(Role.Miner).length;

        const sources = corps.baseRoom.find(FIND_SOURCES_ACTIVE);

        if (minerNum < sources.length) {
            const count = sources.length - minerNum;
            corps.scheduler.pushTask({
                type: TaskType.SpawnCreep,
                priority: PRIORITY_NORMAL,
                body: calcBestMiner(corps),
                role: Role.Miner,
                corps: corps.name,
                tag: Role.Miner,
            }, count);
        }
    },
    SpawnCarrier: (corps: Corps) => {
        if (!corps.baseRoom.storage)
            return;
        const carruerNum: number = corps.getCreepInRole(Role.Carrier).length;
        const expectedCarrierNum = 1;

        if (carruerNum < expectedCarrierNum) {
            const count = expectedCarrierNum - carruerNum;
            corps.scheduler.pushTask({
                type: TaskType.SpawnCreep,
                priority: PRIORITY_LOW,
                body: calcBestCarrier(corps),
                role: Role.Carrier,
                corps: corps.name,
                tag: Role.Carrier,
            }, count);
        }
    },
    MineSource: (corps: Corps) => {
        const miner = _.get(corps.roles, Role.Miner, []);
        if (!miner.length)
            return;
        const sources = corps.baseRoom.find(FIND_SOURCES_ACTIVE);

        _.forEach(sources, source => {
            const storage = source.pos.findClosestByPath(FIND_STRUCTURES, { filter: isStorage, ignoreCreeps: true });
            if (isStorable(storage))
                corps.scheduler.pushTask({
                    type: TaskType.Store,
                    priority: PRIORITY_NORMAL,
                    only: Role.Miner,
                    tag: source.id,
                    resource: RESOURCE_ENERGY,
                    from: source.id,
                    targetId: storage.id
                });
        });
    },
    GatherResource: (corps: Corps) => {
        const carrier = corps.getCreepInRole(Role.Carrier);
        if (!carrier.length || !isStorable(corps.baseRoom.storage))
            return;
        const containers = corps.baseRoom.find<Structure>(FIND_STRUCTURES, { filter: s => isLoadableContainer(s, RESOURCE_ENERGY) });
        _.forEach(containers, container => {
            corps.scheduler.pushTask({
                type: TaskType.Transfer,
                priority: PRIORITY_NORMAL + getResourceAmount(container, RESOURCE_ENERGY) / getResourceCapacity(container),
                only: Role.Carrier,
                tag: container.id,
                resource: RESOURCE_ENERGY,
                from: container.id,
                targetId: corps.baseRoom.storage!.id,
                timeout: Game.time + 20,
            });
        });
    },
    LinkTransfer: (corps: Corps) => {
        if (!isStorable(corps.baseRoom.storage))
            return;
        const centerLink = corps.baseRoom.storage.pos.findClosestByPath<StructureLink>(FIND_MY_STRUCTURES, { filter: s => s instanceof StructureLink });
        if (isStorable(centerLink)) {
            _(corps.baseRoom.find<StructureLink>(FIND_MY_STRUCTURES, { filter: s => s instanceof StructureLink && isLoadable(s, RESOURCE_ENERGY) }))
                .without(centerLink)
                .forEach(link => {
                    link.transferEnergy(centerLink);
                });
        }
    },
    KeepControllerLevel: (corps: Corps) => {
        const controller = corps.baseRoom.controller;
        if (controller && controller.ticksToDowngrade < 5000)
            corps.scheduler.pushTask({
                type: TaskType.UpgradeController,
                targetId: controller.id,
                priority: PRIORITY_HIGH,
                tag: controller.id,
                safeTicks: 8000,
            }, 2);
    },
    UpgradeControllerLevel: (corps: Corps) => {
        const controller = corps.baseRoom.controller;
        if (controller)
            corps.scheduler.pushTask({
                type: TaskType.UpgradeController,
                targetId: controller.id,
                priority: PRIORITY_NORMAL,
                tag: controller.id,
            }, controller.level / AI_CONFIG.upgradeTaskRatio + 1);
    },
    Build: (corps: Corps) => {
        _.forEach(corps.baseRoom.find(FIND_CONSTRUCTION_SITES), s => {
            corps.scheduler.pushTask({
                type: TaskType.Build,
                targetId: s.id,
                priority: PRIORITY_NORMAL,
                tag: s.id,
            }, 1);
        });
    },
    Repair: (corps: Corps) => {
        _.forEach(corps.baseRoom.find(FIND_MY_STRUCTURES, { filter: struct => struct.hits < struct.hitsMax && struct.structureType != STRUCTURE_RAMPART }),
            s => {
                corps.scheduler.pushTask({
                    type: TaskType.Repair,
                    targetId: s.id,
                    priority: PRIORITY_HIGH,
                    tag: s.id,
                }, 1);
            });
    },
    RepairDecay: (corps: Corps) => {
        _.forEach(corps.baseRoom.find(FIND_STRUCTURES, {
            filter:
                struct => struct.hits / struct.hitsMax < AI_CONFIG.roadHitsTolerance
                    && RegularMaintain.includes(struct.structureType)
        }), s => {
            corps.scheduler.pushTask({
                type: TaskType.Repair,
                targetId: s.id,
                priority: PRIORITY_LOW,
                tag: s.id,
            }, 1);
        });
    },
    RepairDefence: (corps: Corps) => {
        _.forEach(corps.baseRoom.find(FIND_STRUCTURES, {
            filter:
                struct => struct.hits < 50000
                    && (struct.structureType == STRUCTURE_RAMPART || struct.structureType == STRUCTURE_WALL)
        }), s => {
            corps.scheduler.pushTask({
                type: TaskType.Repair,
                targetId: s.id,
                priority: PRIORITY_LOW + Math.log10(1 / (s.hits + 1)),
                tag: s.id,
                hits: 60000,
                timeout: Game.time + AI_CONFIG.repairTimeout,
            }, 1);
        });
    },
    Charge: (corps: Corps) => {
        _.forEach(corps.baseRoom.find<Structure>(FIND_MY_STRUCTURES), s => {
            if (isEnergyContainer(s) && s.energy < s.energyCapacity)
                corps.scheduler.pushTask({
                    type: TaskType.Charge,
                    targetId: s.id,
                    priority: PRIORITY_NORMAL + 100,
                    tag: s.id,
                }, 1);
        });
    }
}
