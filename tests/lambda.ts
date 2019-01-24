import * as chai from 'chai';
import { errorLike } from '../src/lambda';

before(() => {
  chai.should();
});

// https://www.chaijs.com/api/bdd/
describe('lambda', () => {
  // https://aws.amazon.com/blogs/compute/error-handling-patterns-in-amazon-api-gateway-and-aws-lambda/
  describe('#errorLike', () => {
    it('detects unhandled function errors', () => {
      chai
        .expect(
          errorLike({
            errorMessage: 'whoops',
            errorType: 'errrr',
            stackTrace: []
          })
        )
        .to.eq(true);
    });
    it('detects function errors', () => {
      chai
        .expect(
          errorLike({
            errorMessage: "I'm aware"
          })
        )
        .to.eq(true);
    });
    it('does not mis-detect user data', () => {
      chai
        .expect(
          errorLike({
            foo: true
          })
        )
        .to.eq(false);
    });
  });
});
