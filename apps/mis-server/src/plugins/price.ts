import { Logger, plugin } from "@ddadaal/tsgrpc-server";
import { MySqlDriver, SqlEntityManager } from "@mikro-orm/mysql";
import { Decimal } from "@scow/lib-decimal";
import { clusters } from "src/config/clusters";
import { AmountStrategy, JobPriceItem } from "src/entities/JobPriceItem";
import { DEFAULT_TENANT_NAME, UNKNOWN_PRICE_ITEM } from "src/utils/constants";

export interface JobInfo {
  biJobIndex: number;
  cluster: string;
  partition: string;
  qos: string;
  timeUsed: number;
  cpusAlloc: number;
  gpu: number;
  memReq: number;
  memAlloc: number;
  account: string;
  tenant: string;
}

export interface PricePlugin {
  price: {
    createPriceMap: () => Promise<PriceMap>;
  }
}

export interface PriceMap {
  // path: [cluster, partition, qos]
  getPriceItem(path: [string, string, string], tenantName?: string): JobPriceItem;
  getPriceMap(tenantName?: string): Record<string, JobPriceItem>;

  calculatePrice(info: JobInfo): JobPriceInfo;

  checkDefaultBillingItemsCompleteness(): void;
}

export const pricePlugin = plugin(async (s) => {

  const logger = s.logger.child({ plugin: "price" });

  s.addExtension("price", <PricePlugin["price"]>{
    createPriceMap: () => createPriceMap(s.ext.orm.em.fork(), logger),
  });

});

export function getActiveBillingItems(items: JobPriceItem[]) {
  // { [cluster.partition[.qos]]: price }
  const defaultPrices: Record<string, JobPriceItem> = {};
  // { tenantName: { [cluster.partition[.qos] ]: price }}
  const tenantSpecificPrices: Record<string, Record<string, JobPriceItem>> = {};

  items.forEach((item) => {
    if (!item.tenant) {
      defaultPrices[item.path.join(".")] = item;
    } else {
      const tenantName = item.tenant.getProperty("name");
      if (!(tenantName in tenantSpecificPrices)) {
        tenantSpecificPrices[tenantName] = {};
      }
      tenantSpecificPrices[tenantName][item.path.join(".")] = item;
    }
  });

  return { defaultPrices, tenantSpecificPrices };
}

export async function createPriceMap(em: SqlEntityManager<MySqlDriver>, logger: Logger): Promise<PriceMap> {
  // get all billing items
  // order by ASC so that items added later overrides items added before.
  const billingItems = await em.find(JobPriceItem, {}, {
    populate: ["tenant"],
    orderBy: { createTime: "ASC" },
  });

  const { defaultPrices, tenantSpecificPrices } = getActiveBillingItems(billingItems);

  logger.info("Default Price Map: %o", defaultPrices);
  logger.info("Tenant specific prices %o", tenantSpecificPrices);

  const getPriceItem = (path: [string, string, string], tenantName?: string) => {

    const [cluster, partition, qos] = path;

    if (tenantName && tenantName !== DEFAULT_TENANT_NAME && tenantName in tenantSpecificPrices) {
      const specific = tenantSpecificPrices[tenantName][[cluster, partition, qos].join(".")] ||
        tenantSpecificPrices[tenantName][[cluster, partition].join(".")];

      if (specific) { return specific; }
    }

    const price = defaultPrices[[cluster, partition, qos].join(".")] ||
        defaultPrices[[cluster, partition].join(".")];

    if (!price) {
      throw new Error(`Unknown cluster ${cluster} partition ${partition} qos ${qos}`);
    }

    return price;
  };

  return {

    calculatePrice: (info) => calculateJobPrice(info, getPriceItem, logger),

    checkDefaultBillingItemsCompleteness: () => {
      for (const cluster in clusters.clusters) {
        for (const partition in clusters.clusters[cluster]) {
          const path = [cluster, partition];

          const { qos } = clusters.clusters[cluster][partition];

          if (path.join(".") in defaultPrices) {
            continue;
          }

          if (Array.isArray(qos)) {
            qos.forEach((q) => {
              const newPath = [...path, q].join(".");
              if (!(newPath in defaultPrices)) {
                throw new Error(`${newPath} not defined in JobBillingItem table.`);
              }
            });
          } else {
            throw new Error(`${path.join(".")} not defined in JobBillingItem table.`);
          }
        }
      }

      logger.info("Billing Items defined in db covers all items in clustersSpecs.json");
    },

    getPriceMap: (tenantName) => {
      return {
        ...defaultPrices,
        ...(tenantName && tenantName !== DEFAULT_TENANT_NAME) ? tenantSpecificPrices[tenantName] : undefined,
      };
    },

    getPriceItem,
  };
}

interface JobPriceInfo {
  tenant: { billingItemId: string; price: Decimal; }
  account: { billingItemId: string; price: Decimal; }
}



export function calculateJobPrice(
  info: JobInfo, getPriceItem: PriceMap["getPriceItem"],
  logger: Logger): JobPriceInfo {

  logger.trace(`Calculating price for job ${info.biJobIndex}`);

  const clusterInfo = clusters[info.cluster];

  if (!clusterInfo) {
    logger.warn(`Unknown cluster ${info.cluster}`);
    return {
      tenant: { billingItemId: UNKNOWN_PRICE_ITEM, price: new Decimal(0) },
      account: { billingItemId: UNKNOWN_PRICE_ITEM, price: new Decimal(0) },
    };
  }

  const partitionInfo = clusterInfo.slurm.partitions[info.partition];
  if (!partitionInfo) {
    logger.warn(`Unknown partition ${info.partition} of cluster ${info.cluster}`);
    return {
      tenant: { billingItemId: UNKNOWN_PRICE_ITEM, price: new Decimal(0) },
      account: { billingItemId: UNKNOWN_PRICE_ITEM, price: new Decimal(0) },
    };
  }

  const { mem, gpus, cores } = partitionInfo;

  const path = [info.cluster, info.partition, info.qos] as [string, string, string];

  function calculatePrice(
    priceItem: JobPriceItem,
  ) {
    const time = new Decimal(info.timeUsed)
      .div(3600); // 秒到小时

    let amount: Decimal;

    switch (priceItem.amount) {
    case AmountStrategy.GPU:
      amount = new Decimal(info.gpu);
      break;
    case AmountStrategy.CPUS_ALLOC:
      amount = new Decimal(info.cpusAlloc);
      break;
    case AmountStrategy.MAX_GPU_CPUSALLOC:
      amount = Decimal.max(
        info.gpu,
        new Decimal(info.cpusAlloc).div(
          new Decimal(cores).div(gpus),
        ).integerValue(Decimal.ROUND_CEIL),
      );
      break;
    case AmountStrategy.MAX_CPUSALLOC_MEM:
      amount = Decimal.max(
      // 核心数
        info.cpusAlloc,

        // 申请内存总数/(分区内容/分区核心数)
        new Decimal(info.memReq).div(
          new Decimal(mem).div(cores),
        ).integerValue(Decimal.ROUND_CEIL),
      );
      break;
    default:
      logger.warn("Unknown unit %s. Count as 0", priceItem.amount);
      amount = new Decimal(0);
    }

    amount = amount.multipliedBy(time);

    amount = amount.decimalPlaces(3, Decimal.ROUND_DOWN);

    return priceItem.price.multipliedBy(amount).decimalPlaces(3, Decimal.ROUND_HALF_CEIL);
  }
  const accountBase = getPriceItem(path, info.tenant);
  const tenantBase = getPriceItem(path);

  const accountPrice = calculatePrice(accountBase);
  const tenantPrice = calculatePrice(tenantBase);

  return {
    tenant: { billingItemId: tenantBase.itemId, price: tenantPrice },
    account: { billingItemId: accountBase.itemId, price: accountPrice },
  };
}

