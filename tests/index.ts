import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";

before(() => {
    chai.should();
    chai.use(chaiAsPromised);
});

// https://www.chaijs.com/api/bdd/
describe('Localhost', () => {
    it("works", () => {
        chai.expect(1 + 1).to.eq(2);
    });
});