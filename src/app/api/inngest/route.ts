import { serve } from "inngest/next";
import { inngest } from "@/server/jobs/inngest-client";
import { parseResume, type ParseResumePayload } from "@/server/jobs/parse-resume";
import { getServices } from "@/server/container";

const parseResumeFunction = inngest.createFunction(
  {
    id: "parse-resume",
    name: "Parse Resume Ingestion",
    triggers: [{ event: "job/parse-resume" }],
  },
  async ({ event }: { event: { data: ParseResumePayload } }) => {
    const payload = event.data;
    // Serve runs under live DB configuration when deployed
    const services = getServices();
    await parseResume(payload, services);
  }
);

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    parseResumeFunction,
  ],
});
