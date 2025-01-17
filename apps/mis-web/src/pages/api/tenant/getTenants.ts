import { route } from "@ddadaal/next-typed-api-routes-runtime";
import { asyncClientCall } from "@ddadaal/tsgrpc-client";
import { authenticate } from "src/auth/server";
import { TenantServiceClient } from "src/generated/server/tenant";
import { PlatformRole } from "src/models/User";
import { getClient } from "src/utils/client";

export interface GetTenantsSchema {
  method: "GET";

  responses: {
    200: {
      names: string[];
    }
  }
}

const auth = authenticate((info) => info.platformRoles.includes(PlatformRole.PLATFORM_ADMIN));

export default route<GetTenantsSchema>("GetTenantsSchema",
  async (req, res) => {

    const info = await auth(req, res);
    if (!info) { return; }

    const client = getClient(TenantServiceClient);

    const { names } = await asyncClientCall(client, "getTenants", {});

    return { 200: { names } };
  });
