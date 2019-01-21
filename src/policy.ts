import { Corps } from "corps";
import { PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW } from "task";
import { AI_CONFIG } from "config";
import _, { Dictionary } from "lodash";

function calcBestWorker(energy: number): BodyPartConstant[] {
    const basic = [WORK, CARRY, MOVE];
    const count = _.clamp(_.floor(energy / _.sumBy(basic, part => BODYPART_COST[part])), 1, 3);
    return _.flatten(_.times(count, _.constant(basic)));
}

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
                body: calcBestWorker(corps.baseRoom.energyCapacityAvailable),
                role: Role.Worker,
                corps: corps.name,
                tag: Role.Worker,
            }, count);
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
        for (let s of corps.baseRoom.find(FIND_CONSTRUCTION_SITES)) {
            corps.scheduler.pushTask({
                type: TaskType.Build,
                targetId: s.id,
                priority: PRIORITY_NORMAL,
                tag: s.id,
            }, 1);
        }
    },
    Repair: (corps: Corps) => {
        for (let s of corps.baseRoom.find(FIND_MY_STRUCTURES, { filter: struct => struct.hits < struct.hitsMax && struct.structureType != STRUCTURE_RAMPART })) {
            corps.scheduler.pushTask({
                type: TaskType.Repair,
                targetId: s.id,
                priority: PRIORITY_HIGH,
                tag: s.id,
            }, 1);
        }
    },
    RepairRoad: (corps: Corps) => {
        for (let s of corps.baseRoom.find(FIND_STRUCTURES, {
            filter:
                struct => struct.hits / struct.hitsMax < AI_CONFIG.roadHitsTolerance
                    && struct.structureType == STRUCTURE_ROAD
        })) {
            corps.scheduler.pushTask({
                type: TaskType.Repair,
                targetId: s.id,
                priority: PRIORITY_LOW,
                tag: s.id,
            }, 1);
        }
    },
    RepairDefence: (corps: Corps) => {
        for (let s of corps.baseRoom.find(FIND_STRUCTURES, {
            filter:
                struct => struct.hits < 50000
                    && (struct.structureType == STRUCTURE_RAMPART || struct.structureType == STRUCTURE_WALL)
        })) {
            corps.scheduler.pushTask({
                type: TaskType.Repair,
                targetId: s.id,
                priority: PRIORITY_LOW + Math.log10(1 / (s.hits + 1)),
                tag: s.id,
                hits: 50000,
            }, 1);
        }
    },
    Transfer: (corps: Corps) => {
        for (let s of corps.baseRoom.find<StructureExtension | StructureSpawn>(FIND_MY_STRUCTURES, {
            filter: structure => structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN
        })) {
            if (s.energy < s.energyCapacity)
                corps.scheduler.pushTask({
                    type: TaskType.Transfer,
                    targetId: s.id,
                    resource: RESOURCE_ENERGY,
                    priority: PRIORITY_NORMAL + 100,
                    tag: s.id,
                }, 1);
        }
    }
}