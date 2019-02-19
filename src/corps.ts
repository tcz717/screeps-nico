import _, { Dictionary } from "lodash";
import { PolicySet } from "policy";
import { PrioritySchduler, Scheduler } from "scheduler";
import { loadTask, Excutable, getTaskMemory } from "task";
import { AI_CONFIG } from "config";

export class Corps {
    readonly memory: CorpsMemory;
    readonly scheduler: Scheduler;
    readonly baseRoom: Room;
    readonly creeps: Creep[];
    readonly spawns: StructureSpawn[];
    readonly excutors: Excutable[];
    readonly name: string;
    readonly roles: Dictionary<Creep[]>;
    readonly towers: StructureTower[];

    constructor(name: string) {
        this.memory = Memory.corps[name];
        this.name = this.memory.name
        this.baseRoom = Game.rooms[this.memory.roomName];
        this.creeps = _(this.memory.creeps).map(name => Game.creeps[name]).compact().value();
        this.spawns = _(this.memory.spawns).map(name => Game.spawns[name]).compact().value();
        this.towers = this.baseRoom.find<StructureTower>(FIND_MY_STRUCTURES, { filter: s => s instanceof StructureTower });
        this.excutors = _.concat<Excutable>(this.creeps, this.spawns, this.towers);
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
            counter: {},
            nextPolicy: 0,
            aveQueueLength: 0,
            blueprints: {},
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

    getCreepInRole(role: Role): Creep[] {
        return _.get(this.roles, role, []);
    }

    update(policySet: PolicySet): void {
        this.scheduler.schedule();

        _(this.excutors).forEach(excutor => {
            const task = getTaskMemory(excutor);
            if (task != undefined)
                loadTask(task).excute(excutor);
        })

        for (const name in policySet) {
            const policy = policySet[name];
            policy(this);
        }

        this.statistic();
        this.cleanMemory();
    }
    private statistic() {
        if (Game.time % 5 == 0)
            this.printMetrics();
        this.memory.aveQueueLength += AI_CONFIG.queueLearningRate * (this.memory.taskQueue.length - this.memory.aveQueueLength);
    }
    private printMetrics(): any {
        const idleNum = _(this.creeps).map(c => c.memory.task).filter(_.isUndefined).value().length;
        console.log(`idle: ${idleNum}, queue: ${this.memory.taskQueue.length}, worker: ${this.getCreepInRole(Role.Worker).length}`);
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