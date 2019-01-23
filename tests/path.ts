import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import { translatePath } from "../src/path";

before(() => {
    chai.should();
    chai.use(chaiAsPromised);
});

// https://www.chaijs.com/api/bdd/
describe('path', () => {
    describe('#translatePath', () => {
        it("translates / to /", () => {
            chai.expect(translatePath("/")).to.eq("/");
        });
        // https://expressjs.com/en/guide/routing.html#route-parameters
        it("translates /foo/{bar}/baz/{boom} to /foo/:bar/baz/:boom", () => {
            chai.expect(translatePath("/foo/{bar}/baz/{boom}")).to.eq("/foo/:bar/baz/:boom");
        });
        it("translates /foo/{proxy+} to /foo/*", () => {
            chai.expect(translatePath("/foo/{proxy+}")).to.eq("/foo/*");
        });
    });
});