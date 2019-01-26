import * as chai from 'chai';
import { isHttpEvent, translateMethod, translatePath } from '../src/http';

before(() => {
  chai.should();
});

// https://www.chaijs.com/api/bdd/
describe('http', () => {
  describe('#isHttpEvent', () => {
    it('returns true with a defined "http" key ', () => {
      chai.expect(isHttpEvent({ http: 'GET /' })).to.eq(true);
    });
    it('returns false with an undefined "http" key ', () => {
      chai.expect(isHttpEvent({ cron: 'expression' })).to.eq(false);
    });
  });
  describe('#translateMethod', () => {
    it('translates GET to get (upper to lowercase)', () => {
      chai.expect(translateMethod('GET')).to.eq('get');
    });
    it('translates ANY to all (wildcard)', () => {
      chai.expect(translateMethod('ANY')).to.eq('all');
    });
  });
  describe('#translatePath', () => {
    it('translates / to /', () => {
      chai.expect(translatePath('/')).to.eq('/');
    });
    // https://expressjs.com/en/guide/routing.html#route-parameters
    it('translates /foo/{bar}/baz/{boom} to /foo/:bar/baz/:boom', () => {
      chai
        .expect(translatePath('/foo/{bar}/baz/{boom}'))
        .to.eq('/foo/:bar/baz/:boom');
    });
    it('translates /foo/{proxy+} to /foo/*', () => {
      chai.expect(translatePath('/foo/{proxy+}')).to.eq('/foo/*');
    });
  });
});
