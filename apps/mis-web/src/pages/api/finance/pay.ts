import { route } from "@ddadaal/next-typed-api-routes-runtime";
import { asyncClientCall } from "@ddadaal/tsgrpc-client";
import { Status } from "@grpc/grpc-js/build/src/constants";
import { moneyToNumber, numberToMoney } from "@scow/lib-decimal";
import { authenticate } from "src/auth/server";
import { ChargingServiceClient } from "src/generated/server/charging";
import { TenantRole } from "src/models/User";
import { ensureNotUndefined } from "src/utils/checkNull";
import { getClient } from "src/utils/client";
import { handlegRPCError, parseIp } from "src/utils/server";

export interface FinancePaySchema {
  method: "POST";

  body: {
    amount: number;
    accountName: string;
    comment?: string;
    type: string;
  }

  responses: {
    200: {
      balance: number;
    }
    // account is not found in current tenant.
    404: null;
  }
}

const auth = authenticate((info) => info.tenantRoles.includes(TenantRole.TENANT_FINANCE));

export default route<FinancePaySchema>("FinancePaySchema",
  async (req, res) => {

    const info = await auth(req, res);
    if (!info) { return; }

    const client = getClient(ChargingServiceClient);

    return await asyncClientCall(client, "pay", {
      accountName: req.body.accountName,
      tenantName: info.tenant,
      comment: req.body.comment ?? "",
      amount: numberToMoney(req.body.amount),
      operatorId: info.identityId,
      ipAddress: parseIp(req) ?? "",
      type: req.body.type,
    }).then((reply) => {
      const replyObj = ensureNotUndefined(reply, ["currentBalance"]);

      return { 200: { balance: moneyToNumber(replyObj.currentBalance) } };
    }).catch(handlegRPCError({
      [Status.NOT_FOUND]: () => ({ 404: null }),
    }));

  });
