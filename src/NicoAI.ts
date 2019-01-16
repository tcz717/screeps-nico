import Worker from "worker";

export class NicoAI {
    save(): void {
        Memory.workers = this.workers.map(worker => worker.creep.name);
    }
    workers: Worker[] = [];
    mainSpawn!: StructureSpawn;
    update(): void {
        this.mainSpawn.room.memory.expectedLevel = 2;

        this.workers.forEach((worker) => worker.run());

        if (this.workers.length < 2) {
            var newName = 'Worker' + Game.time;
            console.log('Spawning new Worker: ' + newName);
            if (Game.spawns['MainSpawn'].spawnCreep([WORK, CARRY, MOVE], newName, { memory: { role: 'Worker' } }) == OK)
                this.workers.push(new Worker(Game.creeps[newName]));
        }
        if (this.mainSpawn.spawning) {
            var spawningCreep = Game.creeps[this.mainSpawn.spawning!.name];
            this.mainSpawn.room.visual.text(
                '🛠️' + spawningCreep.memory.role,
                this.mainSpawn.pos.x + 1,
                this.mainSpawn.pos.y,
                { align: 'left', opacity: 0.8 });
        }
    }
    static load(memory: Memory): NicoAI {
        var ai = new NicoAI();
        // Automatically delete memory of missing creeps
        for (const name in Memory.creeps) {
            if (!(name in Game.creeps)) {
                delete Memory.creeps[name];
            }
        }
        if (memory.workers)
            ai.workers = memory.workers
                .filter((name) => name in Game.creeps)
                .map((name) => new Worker(Game.creeps[name]));
        ai.mainSpawn = _.values<StructureSpawn>(Game.spawns)[0];
        return ai;
    }
}
