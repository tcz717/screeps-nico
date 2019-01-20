import { Corps } from "corps";
import { PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW } from "task";

type Policy = (corps: Corps) => void;
export interface PolicySet {
    [name: string]: Policy
}

export const DefaultPolicySet: PolicySet = {
    SpawnWorker: (corps: Corps) => {
        if (corps.creeps.length < 2) {
            const count = 2 - corps.creeps.length;
            corps.scheduler.pushTask({
                type: TaskType.SpawnCreep,
                priority: PRIORITY_HIGH,
                body: [WORK, CARRY, MOVE],
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
                priority: PRIORITY_LOW,
                tag: controller.id,
            }, 1);
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
        for (let s of corps.baseRoom.find(FIND_MY_STRUCTURES, { filter: struct => struct.hits < struct.hitsMax })) {
            corps.scheduler.pushTask({
                type: TaskType.Repair,
                targetId: s.id,
                priority: PRIORITY_HIGH,
                tag: s.id,
            }, 1);
        }
    },
    RepairRoad: (corps: Corps) => {
        for (let s of corps.baseRoom.find(FIND_STRUCTURES, { filter: struct => struct.hits < struct.hitsMax && struct.structureType == STRUCTURE_ROAD })) {
            corps.scheduler.pushTask({
                type: TaskType.Repair,
                targetId: s.id,
                priority: PRIORITY_LOW,
                tag: s.id,
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
                    priority: PRIORITY_NORMAL,
                    tag: s.id,
                }, 1);
        }
    }
}