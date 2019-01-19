import { loadTask, Task, Excutable, PRIORITY_NORMAL, PRIORITY_HIGH, PRIORITY_LOW } from "task";
import _ from "lodash"
import { worker } from "cluster";

export class NicoAI {
    room: Room;
    mainSpawn!: StructureSpawn;
    toRemoveTasks: TaskMemory[] = []
    get workers(): Creep[] { return this.room.find(FIND_MY_CREEPS) }
    update(): void {

        if (this.room.find(FIND_MY_CREEPS).length < this.room.memory.expectedWorkers && !this.mainSpawn.spawning) {
            var newName = 'Worker' + Game.time;
            this.mainSpawn.spawnCreep([WORK, CARRY, MOVE], newName, {
                memory: {
                    role: 'Worker', working: false
                }
            });
        }

        this.excuteTasks();
        this.assignTasks();
        this.generateTasks();
    }
    assignTasks(): void {
        let queue: (TaskMemory | undefined)[] = _.orderBy(this.room.memory.taskQueue, "priority", "desc");
        for (let index = 0; index < queue.length; index++) {
            const memory = queue[index];
            if (!memory)
                break;
            let task = loadTask(memory);
            let idler = _(this.room.find(FIND_MY_CREEPS, {
                filter: worker => !worker.memory.working && !worker.spawning
            }))
                .map(creep => <[Creep, Number]>[creep, task.canExcute(creep)])
                .filter(tuple => tuple[1] > 0)
                .maxBy(1);
            if (!idler) {
                const interruptee = _(this.room.memory.assignedTasks)
                    .filter((memory: TaskMemory) => !memory.uninterruptible && memory.priority < task.memory.priority && memory.lastResult == TaskResult.Acceptable)
                    .map((memory: TaskMemory) => {
                        const creep = Game.getObjectById<Creep>(memory.excutorId);
                        const task = loadTask(memory);
                        return <[Creep, Number, Task]>[creep, task.canExcute(creep!), task]
                    })
                    .filter(tuple => tuple[1] > 0)
                    .maxBy(1);
                if (interruptee) {
                    _.remove(this.room.memory.assignedTasks, interruptee[2].memory);
                    interruptee[2].reset();
                    queue.push(interruptee[2].memory);
                    idler = [interruptee[0], interruptee[1]];
                    console.log(`task ${interruptee[2].memory.type} is interrupted by ${memory.type}`)
                }
            }
            if (idler) {
                this.assignTask(task, idler[0]);
                queue[index] = undefined;
            }
        }
        this.room.memory.taskQueue = _.compact(queue);
    }
    excuteTasks(): void {
        for (const memory of this.room.memory.assignedTasks) {
            const task = loadTask(memory);
            const result = task.excute();
            if (result != TaskResult.Working && result != TaskResult.Acceptable) {
                task.drop(result);
                this.popTask(memory);
            }
        };

        // 🆑清除失效的任务和存储
        _.filter(this.room.memory.taskQueue, task => loadTask(task).isFinished()).forEach(memory => {
            console.log(`detect task ${memory.type} is finished and omit it`);
            this.popTask(memory);
        });
        _.pull(this.room.memory.assignedTasks, ...this.toRemoveTasks);
        _.pull(this.room.memory.taskQueue, ...this.toRemoveTasks);
        for (const key in this.room.memory.objects) {
            if (!Game.getObjectById(key))
                delete this.room.memory.objects[key];
        }
        this.toRemoveTasks = [];
    }
    generateTasks(): void {
        if (this.room.controller && this.room.controller.level < this.room.memory.expectedLevel)
            this.pushTask({
                type: TaskType.UpgradeController,
                targetId: this.room.controller.id,
                priority: PRIORITY_NORMAL,
                level: this.room.memory.expectedLevel,
            }, 1);
        if (this.room.controller && this.room.controller.ticksToDowngrade < 5000)
            this.pushTask({
                type: TaskType.UpgradeController,
                targetId: this.room.controller.id,
                priority: PRIORITY_HIGH,
            }, 1);
        for (let s of this.room.find(FIND_CONSTRUCTION_SITES)) {
            this.pushTask({
                type: TaskType.Build,
                targetId: s.id,
                priority: PRIORITY_NORMAL,
            }, 1);
        }
        for (let s of this.room.find(FIND_MY_STRUCTURES, { filter: struct => struct.hits < struct.hitsMax })) {
            this.pushTask({
                type: TaskType.Repair,
                targetId: s.id,
                priority: PRIORITY_HIGH,
            }, 1);
        }
        for (let s of this.room.find(FIND_STRUCTURES, { filter: struct => struct.hits < struct.hitsMax && struct.structureType == STRUCTURE_ROAD })) {
            this.pushTask({
                type: TaskType.Repair,
                targetId: s.id,
                priority: PRIORITY_LOW,
            }, 1);
        }
        for (let s of this.room.find<StructureExtension | StructureSpawn>(FIND_MY_STRUCTURES, {
            filter: structure => structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN
        })) {
            if (s.energy < s.energyCapacity)
                this.pushTask({
                    type: TaskType.Transfer,
                    targetId: s.id,
                    resource: RESOURCE_ENERGY,
                    priority: PRIORITY_NORMAL,
                }, 1);
        }
    }

    assignTask(task: Task, excutor: Excutable): void {
        task.assign(excutor);
        if (excutor instanceof Creep)
            excutor.memory.working = true;
        this.room.memory.assignedTasks.push(task.memory);
    }
    popTask(memory: TaskMemory): void {
        if (memory.targetId)
            this.room.memory.objects[memory.targetId][memory.type] = this.room.memory.objects[memory.targetId][memory.type] - 1;
        if (memory.excutorId) {
            let excutor = Game.getObjectById(memory.excutorId);
            if (excutor instanceof Creep)
                excutor.memory.working = false;
        }
        this.toRemoveTasks.push(memory);
    }
    pushTask(memory: TaskMemory, maxCount?: number): void {
        const count = maxCount && memory.targetId ? maxCount - this.getObjectTaskNumber(memory.targetId, memory.type) : 1;
        for (let i = 0; i < count; ++i)
            this.room.memory.taskQueue.push(memory);
        if (memory.targetId && count > 0) {
            _.set(this.room.memory.objects,
                [memory.targetId, memory.type],
                this.getObjectTaskNumber(memory.targetId, memory.type) + count);
        }
    }
    getObjectTaskNumber(objectId: string, task: TaskType): number {
        if (this.room.memory.objects[objectId] && this.room.memory.objects[objectId][task])
            return this.room.memory.objects[objectId][task];
        else
            return 0;
    }
    constructor() {
        // Automatically delete memory of missing creeps
        for (const name in Memory.creeps) {
            if (!(name in Game.creeps)) {
                delete Memory.creeps[name];
            }
        }

        this.mainSpawn = _.values<StructureSpawn>(Game.spawns)[0];
        this.room = this.mainSpawn.room;
        if (!this.mainSpawn.room.memory.taskQueue) {
            this.mainSpawn.room.memory = {
                expectedLevel: 2,
                expectedWorkers: 2,
                taskQueue: [],
                assignedTasks: [],
                objects: {},
                sources: _.chain(this.room.find(FIND_SOURCES))
                    .keyBy("id")
                    .mapValues(source => source.pos.getRangeTo(this.mainSpawn))
                    .value(),
            }
        }
    }
}
