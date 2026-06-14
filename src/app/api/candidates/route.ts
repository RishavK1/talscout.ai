import { withAuth } from "@/server/http/with-api";
import { candidateService } from "@/server/services/candidate.service";
import {
  createCandidateSchema,
  listCandidatesQuerySchema,
  type CreateCandidateBody,
  type ListCandidatesQuery,
} from "@/server/validation/candidate";

/** GET /api/candidates — list (paginated, filtered). viewer+ */
export const GET = withAuth<undefined, ListCandidatesQuery>(
  async ({ ctx, query }) => ({ data: await candidateService.list(ctx, query) }),
  { role: "viewer", querySchema: listCandidatesQuerySchema },
);

/** POST /api/candidates — create a manual candidate. recruiter+ */
export const POST = withAuth<CreateCandidateBody>(
  async ({ ctx, body }) => ({
    status: 201,
    data: await candidateService.create(ctx, body),
  }),
  { role: "recruiter", bodySchema: createCandidateSchema },
);
