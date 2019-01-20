import _ from "lodash";
import { PolicySet } from "policy";
import { PrioritySchduler, Scheduler } from "scheduler";
import { loadTask, Excutable } from "task";

export class Corps {
    readonly memory: CorpsMemory;
    readonly scheduler: Scheduler;
    readonly baseRoom: Room;
    readonly creeps: Creep[];
    readonly spawns: StructureSpawn[];
    readonly excutors: (Creep | StructureSpawn)[];
    readonly name: string;

    constructor(name: string) {
        this.memory = Memory.corps[name];
        this.name = this.memory.name
        this.baseRoom = Game.rooms[this.memory.roomName];
        this.creeps = _(this.memory.creeps).map(name => Game.creeps[name]).compact().value();
        this.spawns = _(this.memory.spawns).map(name => Game.spawns[name]).compact().value();
        this.excutors = _.concat<Excutable>(this.creeps, this.spawns);
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
        Corps.initSourceTable(spawn.room);
        spawn.memory = {}
        return Memory.corps[name] = {
            name: name,
            roomName: spawn.pos.roomName,
            spawns: [spawn.name],
            creeps: [],
            taskQueue: [],
            towers: [],
            counter: {},
            nextPolicy: 0,
        }
    }

    update(policySet: PolicySet): void {
        for (const name in policySet) {
            const policy = policySet[name];
            policy(this);
        }

        this.scheduler.schedule();

        for (const excutor of this.excutors) {
            if (excutor.memory.task != undefined)
                loadTask(excutor.memory.task).excute(excutor);
        }

        this.cleanMemory()
    }
    private cleanMemory() {
        _(this.memory.creeps)
            .remove(name => !(name in Game.creeps))
            .forEach(name => delete Memory.creeps[name])

        _(this.memory.spawns)
            .remove(name => !(name in Game.spawns))
            .forEach(name => delete Memory.spawns[name])
    }
}