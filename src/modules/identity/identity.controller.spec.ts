import type { Response } from 'express';
import { IdentityController } from './identity.controller';

describe('IdentityController shared verification page', () => {
  const token = 'a'.repeat(64);
  const identity = { verifyEmail: jest.fn() };
  const controller = new IdentityController(identity as never);
  const response = {
    set: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('shows a form without consuming the token on GET', () => {
    controller.verificationPage(token, response as unknown as Response);

    expect(identity.verifyEmail).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send.mock.calls[0][0]).toContain('method="post"');
    expect(response.send.mock.calls[0][0]).toContain(token);
  });

  it('verifies only after the user submits the form', async () => {
    identity.verifyEmail.mockResolvedValue({ success: true });

    await controller.confirmVerification(token, response as unknown as Response);

    expect(identity.verifyEmail).toHaveBeenCalledWith(token);
    expect(response.send.mock.calls[0][0]).toContain('E-posta adresiniz doğrulandı');
  });

  it('rejects a malformed token before calling the service', async () => {
    await controller.confirmVerification('<bad>', response as unknown as Response);

    expect(identity.verifyEmail).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
  });
});
