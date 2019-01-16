declare const enum TaskType {
  Idle = "i",
  Move = "m",
  Harvest = "h",
  Transfer = "tm",
  UpgradeController = "u",
  Build = "b",
  Repair = "r",
}
declare enum TaskResult {
  Finished,
  Working,
  Fail,
  Cancel,
}
interface Role {
  run(creep: Creep): void;
}
// memory extension samples
interface CreepMemory {
  role: string;
}

interface RoomMemory {
  expectedLevel: number;
  expectedWOrkers: number;
}

interface Memory {
  uuid: number;
  log: any;
  workers: string[];
}

// `global` extension samples
declare namespace NodeJS {
  interface Global {
    log: any;
  }
}
