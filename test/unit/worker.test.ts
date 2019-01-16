import { assert } from "chai";
import { Game, Memory } from "./mock"
import Worker from "worker"

describe("main", () => {
  before(() => {
    // runs before all test in this block
  });

  beforeEach(() => {
    // runs before each test in this block
    // @ts-ignore : allow adding Game to global
    global.Game = _.clone(Game);
    // @ts-ignore : allow adding Memory to global
    global.Memory = _.clone(Memory);
  });

  it("should be able to use JSON.stringify", () => {
    var worker = new Worker(<Creep>{});
    var str = JSON.stringify(worker);
    console.log(str);
    assert.isNotEmpty(str);
  });
});
