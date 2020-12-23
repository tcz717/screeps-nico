import { Architect, StandernProjects } from "architect";
import { AI_CONFIG } from "config";
import { Corps } from "corps";
import _, { Dictionary } from "lodash";
import { PRIORITY_HIGH, PRIORITY_LOW, PRIORITY_NORMAL, PRIORITY_EMERGENCY } from "task";
import { isIdle, isStorable, isStorage, isLoadableContainer, getResourceAmount, getResourceCapacity, isLoadable, isEnergyContainer, isLoadableAny, isLoadableContainerAny, getResource, isExtractor, isMineralStorage } from "utils/helper";
import { getTotalEnergy } from "metric";

function calcBestWorker(corps: Corps): BodyPartConstant[] {
    const basic = [WORK, CARRY, MOVE];
    if (corps.getCreepInRole(Role.Worker).length == 0)
        return basic;
    const maxTimes = getResourceAmount(corps.baseRoom.storage, RESOURCE_ENERGY) > 50000 ? 5 : 3;
    const count = _.clamp(_.floor(corps.baseRoom.energyCapacityAvailable / _.sumBy(basic, _.propertyOf(BODYPART_COST))), 1, maxTimes);
    return _.flatten(_.times(count, _.constant(basic)));
}
function calcBestMiner(corps: Corps): BodyPartConstant[] {
    const basic = [WORK, CARRY, MOVE];
    const count = _.clamp(_.floor(corps.baseRoom.energyCapacityAvailable / _.sumBy(basic, _.propertyOf(BODYPART_COST))), 1, 5);
    return _.flatten(_.times(count, _.constant(basic)));
}
function calcBestCarrier(corps: Corps): BodyPartConstant[] {
    const basic = [CARRY, CARRY, MOVE];
    const count = _.clamp(_.floor(corps.baseRoom.energyCapacityAvailable / _.sumBy(basic, _.propertyOf(BODYPART_COST))), 1, 3);
    return _.flatten(_.times(count, _.constant(basic)));
}
function checkDangerous(enemies: Creep[], corps: Corps) {
    return enemies.length > corps.towers.length || _.some(corps.spawns, (s: StructureSpawn) => s.hits < s.hitsMax);
}

const RegularMaintain: string[] = [STRUCTURE_ROAD, STRUCTURE_CONTAINER];

export type Policy = (corps: Corps) => void;
export type PolicySet = Dictionary<Policy>;

export const DefaultPolicySet: PolicySet = {
    SpawnWorker: (corps: Corps) => {
        var len = corps.memory.aveQueueLength;
        if (corps.baseRoom.find(FIND_CONSTRUCTION_SITES).length == 0)
            len /= 2;

        const expectedWorker = _.clamp(
            len / AI_CONFIG.workQueueRatio,
            AI_CONFIG.minWorker, AI_CONFIG.maxWorker);
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

        const sources = corps.baseRoom.find(FIND_SOURCES);
        const mineral = corps.baseRoom.find(FIND_MY_STRUCTURES, { filter: isExtractor });
        const total = sources.length + mineral.length;

        if (minerNum < total) {
            const count = total - minerNum;
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
    SpawnUpgrader: (corps: Corps) => {
        if (!_.has(corps.memory.blueprints, "sourceRelay"))
            return;
        const upgraderNum: number = corps.getCreepInRole(Role.Upgrader).length;
        const expectedUpgraderNum = getTotalEnergy(corps) > 500000 ? 3 : 2;

        if (upgraderNum < expectedUpgraderNum) {
            const count = expectedUpgraderNum - upgraderNum;
            corps.scheduler.pushTask({
                type: TaskType.SpawnCreep,
                priority: PRIORITY_NORMAL,
                body: calcBestWorker(corps),
                role: Role.Upgrader,
                corps: corps.name,
                tag: Role.Upgrader,
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
    MineMineral: (corps: Corps) => {
        const miner = _.get(corps.roles, Role.Miner, []);
        if (!miner.length)
            return;
        const extractors = corps.baseRoom.find<StructureExtractor>(FIND_MY_STRUCTURES, { filter: isExtractor });;

        _.forEach(extractors, extractor => {
            const storage = extractor.pos.findClosestByPath(FIND_STRUCTURES, { filter: isMineralStorage, ignoreCreeps: true });
            const mineral = extractor.pos.lookFor(LOOK_MINERALS)[0];
            if (isStorable(storage))
                corps.scheduler.pushTask({
                    type: TaskType.Store,
                    priority: PRIORITY_NORMAL,
                    only: Role.Miner,
                    tag: mineral.id,
                    resource: mineral.mineralType,
                    from: mineral.id,
                    targetId: storage.id
                });
        });
    },
    GatherResource: (corps: Corps) => {
        const carrier = corps.getCreepInRole(Role.Carrier);
        if (!carrier.length || !isStorable(corps.baseRoom.storage))
            return;
        _.forEach(corps.baseRoom.find<Structure>(FIND_STRUCTURES, { filter: isLoadableContainerAny }), container =>
            _.forEach(getResource(container), (v, r) => {
                corps.scheduler.pushTask({
                    type: TaskType.Transfer,
                    priority: PRIORITY_NORMAL + v / getResourceCapacity(container),
                    only: Role.Carrier,
                    tag: container.id,
                    resource: r as ResourceConstant,
                    from: container.id,
                    targetId: corps.baseRoom.storage!.id,
                    uninterruptible: r != RESOURCE_ENERGY,
                    timeout: Game.time + 20,
                });
            }));
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
        const upgrader = corps.getCreepInRole(Role.Upgrader);
        if (controller)
            corps.scheduler.pushTask({
                type: TaskType.UpgradeController,
                targetId: controller.id,
                priority: PRIORITY_NORMAL,
                tag: controller.id,
                only: upgrader.length > 0 ? Role.Upgrader : undefined,
                timeout: Game.time + 20,
            }, upgrader.length > 0 ? upgrader.length : 2);
    },
    Build: (corps: Corps) => {
        _.forEach(corps.baseRoom.find(FIND_MY_CONSTRUCTION_SITES), s => {
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
                priority: s.hits / s.hitsMax < 0.1 ? PRIORITY_HIGH : PRIORITY_NORMAL,
                tag: s.id,
                timeout: Game.time + 100
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
                priority: PRIORITY_NORMAL + Math.log10(1 / (s.hits + 1)),
                tag: s.id,
                hits: 60000,
                timeout: Game.time + AI_CONFIG.repairTimeout,
            }, 1);
        });
    },
    Charge: (corps: Corps) => {
        // if (corps.baseRoom.controller!.level < 3) return;
        const center = _.get(corps.baseRoom.storage, 'pos', corps.spawns[0].pos);
        _.forEach(corps.baseRoom.find<Structure>(FIND_MY_STRUCTURES), s => {
            if (isEnergyContainer(s) && s.energy < s.energyCapacity) {
                var bias = 100 - s.pos.getRangeTo(center);
                if (s instanceof StructureTower && corps.baseRoom.find(FIND_HOSTILE_CREEPS).length)
                    bias += 1000;
                corps.scheduler.pushTask({
                    type: TaskType.Charge,
                    targetId: s.id,
                    priority: PRIORITY_NORMAL + bias,
                    tag: s.id,
                }, 1);
            }
        });
    },
    Defend: (corps: Corps) => {
        _.forEach(corps.baseRoom.find(FIND_HOSTILE_CREEPS) as Creep[], s => {
            corps.scheduler.pushTask({
                type: TaskType.Attack,
                targetId: s.id,
                priority: PRIORITY_EMERGENCY,
                tag: s.id,
            }, 2);
        });
    },
    PickupDrop: (corps: Corps) => {
        if (!isStorable(corps.baseRoom.storage) || corps.baseRoom.find(FIND_HOSTILE_CREEPS).length)
            return;
        _.forEach(corps.baseRoom.find(FIND_RUINS, { filter: isLoadableAny }), t =>
            _(t.store).pickBy().forIn((v, r) =>
                corps.scheduler.pushTask({
                    type: TaskType.Transfer,
                    priority: PRIORITY_NORMAL,
                    tag: t.id,
                    resource: r as ResourceConstant,
                    from: t.id,
                    targetId: corps.baseRoom.storage!.id,
                }))
        );
        _.forEach(corps.baseRoom.find(FIND_TOMBSTONES, { filter: isLoadableAny }), t =>
            _(t.store).pickBy().forIn((v, r) =>
                corps.scheduler.pushTask({
                    type: TaskType.Transfer,
                    priority: PRIORITY_EMERGENCY,
                    tag: t.id,
                    resource: r as ResourceConstant,
                    from: t.id,
                    targetId: corps.baseRoom.storage!.id,
                }))
        );
        _.forEach(corps.baseRoom.find(FIND_DROPPED_RESOURCES), r => {
            corps.scheduler.pushTask({
                type: TaskType.Pick,
                from: r.id,
                targetId: corps.baseRoom.storage!.id,
                priority: PRIORITY_EMERGENCY,
                tag: r.id,
            });
        });
    },
    Idle: (corps: Corps) => {
        const controller = corps.baseRoom.controller;
        const idler = corps.getCreepInRole(Role.Worker).filter(isIdle);
        if (controller && idler.length) {
            corps.scheduler.pushTask({
                type: TaskType.UpgradeController,
                targetId: controller.id,
                priority: 0,
                timeout: Game.time + 3,
            }, idler.length);
            console.log(`give ${idler.length} idle workers upgrade task`)
        }
    },
    CheckSafeMode: (corps: Corps) => {
        if (corps.baseRoom.controller!.safeMode || corps.baseRoom.controller!.safeModeAvailable == 0)
            return;
        const enemies = corps.baseRoom.find(FIND_HOSTILE_CREEPS) as Creep[];
        if (checkDangerous(enemies, corps)) {
            corps.baseRoom.controller!.activateSafeMode();
            Game.notify(`Safe mode actived because: \n ${JSON.stringify(enemies)}`)
        }
    },

    Design: Architect(StandernProjects),
}

