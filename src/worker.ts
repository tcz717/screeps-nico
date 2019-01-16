enum WorkerState {
    Idle,
    Harvest,
    Transfer,
    UpgradeController,
    Build,
    Repair,
}
interface WorkerMemory extends CreepMemory {
    structure: string;
    source?: string;
    state: WorkerState;
}
class Worker implements Role {
    creep: Creep;
    memory: WorkerMemory;
    /**
     *
     */
    constructor(creep: Creep) {
        this.memory = <WorkerMemory>creep.memory;
        if (this.memory.state == undefined)
            this.memory.state = WorkerState.Idle;
        this.creep = creep;
    }
    private to(newState: WorkerState): void {
        if (this.memory.state != newState)
            console.log(this.creep.name + ' goes to ' + WorkerState[this.memory.state]);
        this.memory.state = newState;
    }
    run() {
        switch (this.memory.state) {
            case WorkerState.Idle:
                this.check();
                break;
            case WorkerState.Harvest:
                this.harvest();
                break;
            case WorkerState.Transfer:
                this.transfer();
                break;
            case WorkerState.UpgradeController:
                this.upgradeController();
                break;
            case WorkerState.Build:
                this.build();
                break;
            case WorkerState.Repair:
                this.repair();
                break;
        }
    }
    repair(): void {
        this.creep.say('🚧 repair');
        const structure = Game.getObjectById<AnyOwnedStructure>(this.memory.structure);
        if (structure) {
            const result = this.creep.repair(structure);
            if (result == ERR_NOT_IN_RANGE) {
                this.creep.moveTo(structure, { visualizePathStyle: { stroke: '#ffffff' } });
            }
            else if (result == ERR_NOT_ENOUGH_ENERGY)
                this.check();
            else if (result == OK && structure.hits == structure.hitsMax)
                this.check();
        }
        else {
            this.check();
        }
    }
    build(): void {
        this.creep.say('🚧 build');
        var targets = this.creep.room.find(FIND_CONSTRUCTION_SITES);
        if (targets.length) {
            const result = this.creep.build(targets[0]);
            if (result == ERR_NOT_IN_RANGE) {
                this.creep.moveTo(targets[0], { visualizePathStyle: { stroke: '#ffffff' } });
            }
            else if (result == ERR_NOT_ENOUGH_ENERGY)
                this.check();
        }
        else {
            this.check();
        }
    }
    upgradeController(): void {
        this.creep.say('⚡ upgrade');
        if (this.creep.upgradeController(this.creep.room.controller!) == ERR_NOT_IN_RANGE) {
            this.creep.moveTo(this.creep.room.controller!, { visualizePathStyle: { stroke: '#ffffff' } });
        }
        if (this.creep.carry.energy == 0)
            this.check();
    }
    transfer(): void {
        this.creep.say('⚡ transfer');
        const structure = Game.getObjectById<AnyOwnedStructure>(this.memory.structure);
        if (structure && (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN)) {
            const result = this.creep.transfer(structure, RESOURCE_ENERGY);
            if (result == ERR_NOT_IN_RANGE) {
                this.creep.moveTo(structure, { visualizePathStyle: { stroke: '#ffffff' } });
            }
            else if (result == ERR_NOT_ENOUGH_ENERGY || result == ERR_FULL)
                this.check();
        }
        else {
            this.check();
        }
    }
    harvest(): void {
        this.creep.say('🔄 harvest');
        if (this.memory.source) {
            const source = Game.getObjectById<Source>(this.memory.source)!;
            const result = this.creep.harvest(source);
            if (result == ERR_NOT_IN_RANGE) {
                if (this.creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } }) != OK)
                    this.memory.source = undefined;
            }
        }
        else {
            var sources = this.creep.room.find(FIND_SOURCES);
            for (const key in sources) {
                const source = sources[key];
                if (this.creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } }) == OK) {
                    this.memory.source = source.id;
                    break;
                }
            }
        }
        if (this.creep.carry.energy >= this.creep.carryCapacity) {
            this.check();
            return;
        }
    }
    check(): void {
        if (this.creep.spawning) {
            return;
        }
        if (this.creep.carry.energy < this.creep.carryCapacity) {
            this.to(WorkerState.Harvest);
            return;
        }
        if (this.creep.room.controller && (this.creep.room.controller.level < this.creep.room.memory.expectedLevel || this.creep.room.controller.ticksToDowngrade < 8000)) {
            this.to(WorkerState.UpgradeController);
            return;
        }
        var target = this.creep.room.find(FIND_MY_STRUCTURES, { filter: (struct) => struct.hits / struct.hitsMax < 0.5 });
        if (target.length) {
            this.memory.structure = target[0].id;
            this.to(WorkerState.Repair);
            return;
        }
        if (this.creep.room.find(FIND_CONSTRUCTION_SITES).length) {
            this.to(WorkerState.Build);
            return;
        }
        target = this.creep.room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) &&
                    structure.energy < structure.energyCapacity;
            }
        });
        if (target.length) {
            this.memory.structure = target[0].id;
            this.to(WorkerState.Transfer);
            return;
        }
        this.to(WorkerState.Idle);
    }
}

export default Worker;