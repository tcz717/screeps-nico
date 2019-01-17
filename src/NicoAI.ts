import Worker from "worker";
import { loadTask, Task, Excutable, PRIORITY_NORMAL, TaskResult } from "task";

export class NicoAI {
    room: Room;
    mainSpawn!: StructureSpawn;
    get workers(): Creep[] { return this.room.find(FIND_MY_CREEPS) }
    update(): void {

        if (this.room.find(FIND_MY_CREEPS).length < 2 && !this.mainSpawn.spawning) {
            var newName = 'Worker' + Game.time;
            this.mainSpawn.spawnCreep([WORK, CARRY, MOVE], newName, {
                memory: {
                    role: 'Worker', working: false
                }
            });
        }
        if (this.mainSpawn.spawning) {
            var spawningCreep = Game.creeps[this.mainSpawn.spawning!.name];
            this.room.visual.text(
                '\u{1F3ED}' + spawningCreep.memory.role,
                this.mainSpawn.pos.x + 1,
                this.mainSpawn.pos.y,
                { align: 'left', opacity: 0.8 });
        }

        this.excuteTasks();
        this.assignTasks();
        this.generateTasks();
    }
    assignTasks(): void {
        while (this.room.memory.taskQueue.length) {
            let idleWorkers = this.room.find(FIND_MY_CREEPS, {
                filter: worker => !worker.memory.working && !worker.spawning
            });
            if (!idleWorkers.length)
                return;
            let task = loadTask(this.room.memory.taskQueue[0]);
            for (const worker of idleWorkers) {
                if (task.canExcute(worker)) {
                    this.assignTask(task, worker);
                }
            }
            // 暂时采取等待的策略 直到队首任务可以分配
            if (!task.memory.excutorId)
                return;
        }
    }
    excuteTasks(): void {
        _.remove(this.room.memory.assignedTasks,memory => {
            const task = loadTask(memory);
            const result = task.excute();
            if (result != TaskResult.Working && result != TaskResult.Acceptable) {
                console.log("drop task " + memory.type + " because " + TaskResult[result]);
                this.popTask(memory);
                return true;
            }

            return false;
        });
    }
    generateTasks(): void {
        const sources = this.room.find(FIND_SOURCES);
        const aveHarvester = _.max([this.workers.length / sources.length, 1]);
        for (const source of sources) {
            if (this.getObjectTaskNumber(source.id, TaskType.Harvest) < aveHarvester) {
                this.pushTask({
                    type: TaskType.Harvest,
                    targetId: source.id,
                    priority: PRIORITY_NORMAL,
                })
            }
        }
    }

    assignTask(task: Task, excutor: Excutable): void {
        task.assign(excutor);
        if (excutor instanceof Creep)
            excutor.memory.working = true;
        this.room.memory.taskQueue.shift();
        this.room.memory.assignedTasks.push(task.memory);
    }
    popTask(memory: TaskMemory): void {
        if (memory.targetId)
            this.room.memory.objects[memory.targetId][memory.type] = this.room.memory.objects[memory.targetId][memory.type] - 1;
        if (memory.excutorId) {
            let target = Game.getObjectById(memory.excutorId);
            if (target instanceof Creep)
                target.memory.working = false;
        }
        _.pull(this.room.memory.assignedTasks, memory);
        _.pull(this.room.memory.taskQueue, memory);
    }
    pushTask(memory: TaskMemory): void {
        this.room.memory.taskQueue.push(memory);
        if (memory.targetId)
            _.set(this.room.memory.objects,
                [memory.targetId, memory.type],
                this.getObjectTaskNumber(memory.targetId, memory.type) + 1);
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
                expectedWOrkers: 2,
                taskQueue: [],
                assignedTasks: [],
                objects: {}
            }
        }
    }
}
