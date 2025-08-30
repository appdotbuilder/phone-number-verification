import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import { 
  createUserInputSchema,
  startPhoneVerificationInputSchema,
  verifyPhoneCodeInputSchema
} from './schema';

// Import handlers
import { createUser } from './handlers/create_user';
import { getUser, getUserByEmail } from './handlers/get_user';
import { startPhoneVerification } from './handlers/start_phone_verification';
import { verifyPhoneCode } from './handlers/verify_phone_code';
import { resendVerificationCode } from './handlers/resend_verification_code';
import { updateUser } from './handlers/update_user';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check endpoint
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // User management routes
  createUser: publicProcedure
    .input(createUserInputSchema)
    .mutation(({ input }) => createUser(input)),

  getUser: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => getUser(input.userId)),

  getUserByEmail: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .query(({ input }) => getUserByEmail(input.email)),

  // Phone verification routes
  startPhoneVerification: publicProcedure
    .input(startPhoneVerificationInputSchema)
    .mutation(({ input }) => startPhoneVerification(input)),

  verifyPhoneCode: publicProcedure
    .input(verifyPhoneCodeInputSchema)
    .mutation(({ input }) => verifyPhoneCode(input)),

  resendVerificationCode: publicProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(({ input }) => resendVerificationCode(input.userId)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();