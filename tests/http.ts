import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import { translatePath, translateMethod } from "../src/http";

before(() => {
    chai.should();
    chai.use(chaiAsPromised);
});

// https://www.chaijs.com/api/bdd/
describe('http', () => {
    describe("#translateMethod", () => {
        it("translates GET to get (upper to lowercase)", () => {
            chai.expect(translateMethod("GET")).to.eq("get");
        });
        it("translates ANY to all (wildcard)", () => {
            chai.expect(translateMethod("ANY")).to.eq("all");
        });
    });
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