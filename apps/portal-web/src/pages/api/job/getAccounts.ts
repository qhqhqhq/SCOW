import { authenticate } from "src/auth/server";
import { getClusterOps } from "src/clusterops";
import { route } from "src/utils/route";

export interface GetAccountsSchema {

  method: "GET";

  query: {
    cluster: string;
  }

  responses: {
    200: {
      accounts: string[];
    }
  }
}

const auth = authenticate(() => true);

export default route<GetAccountsSchema>("GetAccountsSchema", async (req, res) => {


  const info = await auth(req, res);

  if (!info) { return; }

  const { cluster } = req.query;

  const clusterops = getClusterOps(cluster);

  const reply = await clusterops.job.getAccounts({
    userId: info.identityId,
  }, req.log);

  return { 200: { accounts: reply.accounts } };

});
