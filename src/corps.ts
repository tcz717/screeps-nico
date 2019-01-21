import _, { Dictionary } from "lodash";
import { PolicySet } from "policy";
import { PrioritySchduler, Scheduler } from "scheduler";
import { loadTask, Excutable } from "task";
import { AI_CONFIG } from "config";

export class Corps {
    readonly memory: CorpsMemory;
    readonly scheduler: Scheduler;
    readonly baseRoom: Room;
    readonly creeps: Creep[];
    readonly spawns: StructureSpawn[];
    readonly excutors: (Creep | StructureSpawn)[];
    readonly name: string;
    readonly roles: Dictionary<Creep[]>;

    constructor(name: string) {
        this.memory = Memory.corps[name];
        this.name = this.memory.name
        this.baseRoom = Game.rooms[this.memory.roomName];
        this.creeps = _(this.memory.creeps).map(name => Game.creeps[name]).compact().value();
        this.spawns = _(this.memory.spawns).map(name => Game.spawns[name]).compact().value();
        this.excutors = _.concat<Excutable>(this.creeps, this.spawns);
        this.roles = _.groupBy(this.creeps, creep => creep.memory.role);
        this.scheduler = new PrioritySchduler(this);
    }

    static create(name: string, baseroom: string): CorpsMemory {
        const room = Game.rooms[baseroom];
        Corps.initSourceTable(room);
        return Memory.corps[name] = {
            name: name,
            roomName: baseroom,
            spawns: [],
            creeps: [],
            taskQueue: [],
            towers: [],
            counter: {},
            nextPolicy: 0,
            aveQueueLength: 0,
        }
    }
    private static initSourceTable(room: Room) {
        if (!room.memory.sources)
            room.memory.sources = _.chain(room.find(FIND_SOURCES))
                .keyBy("id")
                .mapValues(source => source.pos.getRangeTo(room.controller!) * 5)
                .value();
    }

    static createBySpawn(name: string, spawn: StructureSpawn): CorpsMemory {
        const corps = Corps.create(name, spawn.room.name);
        corps.spawns = [spawn.name];
        return corps;
    }

    update(policySet: PolicySet): void {
        this.scheduler.schedule();

        for (const excutor of this.excutors) {
            if (excutor.memory.task != undefined)
                loadTask(excutor.memory.task).excute(excutor);
        }

        for (const name in policySet) {
            const policy = policySet[name];
            policy(this);
        }

        this.statistic();
        this.cleanMemory();
    }
    private statistic() {
        this.memory.aveQueueLength += AI_CONFIG.queueLearningRate * (this.memory.taskQueue.length - this.memory.aveQueueLength);
    }

    private cleanMemory() {
        _(this.memory.creeps)
            .remove(name => !(name in Game.creeps))
            .forEach(name => {
                console.log(`${name} died`)
                this.scheduler.shutdownTask(Memory.creeps[name].task);
                delete Memory.creeps[name];
            })

        _(this.memory.spawns)
            .remove(name => !(name in Game.spawns))
            .forEach(name => {
                console.log(`${name} died`)
                this.scheduler.shutdownTask(Memory.spawns[name].task);
                delete Memory.spawns[name];
            })

    }
}