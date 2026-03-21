import 'dotenv/config';
import { getSupabaseServerClient } from '../lib/db';
import { getAvailableTickers, getCompanyFacts } from '../lib/financial-datasets';

const BATCH_SIZE = 20;
const DELAY_BETWEEN_BATCHES_MS = 2000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Sentinel: Seed Stock Universe ===\n');

  const db = getSupabaseServerClient();

  console.log('Building target universe: S&P 500 core list + API supplements...');
  let apiTickers: string[] = [];
  try {
    apiTickers = await getAvailableTickers();
    console.log(`Found ${apiTickers.length} available tickers from API`);
  } catch (err) {
    console.error('Failed to fetch tickers list from API, using S&P 500 only');
  }

  const targetTickers = [...SP500_FALLBACK];
  console.log(`Processing ${targetTickers.length} S&P 500 tickers...\n`);

  let inserted = 0;
  let enriched = 0;
  let errors = 0;

  for (let i = 0; i < targetTickers.length; i += BATCH_SIZE) {
    const batch = targetTickers.slice(i, i + BATCH_SIZE);

    const factsPromises = batch.map(async (ticker) => {
      const base = {
        symbol: ticker,
        name: ticker,
        sector: null as string | null,
        industry: null as string | null,
        market_cap: null as number | null,
        exchange: null as string | null,
        is_active: true,
      };
      try {
        const facts = await getCompanyFacts(ticker);
        if (facts) {
          base.name = facts.name || ticker;
          base.sector = facts.sector || facts.sic_sector || null;
          base.industry = facts.industry || facts.sic_industry || null;
          base.exchange = facts.exchange || null;
          base.is_active = facts.is_active ?? true;
          enriched++;
        }
      } catch {
        // company facts unavailable — insert with symbol-only data
      }
      return base;
    });

    const results = await Promise.all(factsPromises);

    const { error } = await db
      .from('stocks')
      .upsert(results, { onConflict: 'symbol' });

    if (error) {
      console.error(`  Batch error: ${error.message}`);
      errors += results.length;
    } else {
      inserted += results.length;
    }

    const progress = Math.min(i + BATCH_SIZE, targetTickers.length);
    console.log(
      `[${progress}/${targetTickers.length}] Inserted: ${inserted} | Enriched: ${enriched} | Errors: ${errors}`,
    );

    if (i + BATCH_SIZE < targetTickers.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log('\n=== Seed Complete ===');
  console.log(`Total inserted:  ${inserted}`);
  console.log(`Total enriched:  ${enriched} (with sector/industry from company facts)`);
  console.log(`Total errors:    ${errors}`);
}

const SP500_FALLBACK = [
  'AAPL','ABBV','ABT','ACN','ADBE','ADI','ADM','ADP','ADSK','AEE','AEP','AES',
  'AFL','AIG','AIZ','AJG','AKAM','ALB','ALGN','ALK','ALL','ALLE','AMAT','AMCR',
  'AMD','AME','AMGN','AMP','AMT','AMZN','ANET','ANSS','AON','AOS','APA','APD',
  'APH','APTV','ARE','ATO','ATVI','AVB','AVGO','AVY','AWK','AXP','AZO',
  'BA','BAC','BAX','BBWI','BBY','BDX','BEN','BF.B','BIIB','BIO','BK','BKNG',
  'BKR','BLK','BMY','BR','BRK.B','BRO','BSX','BWA','BXP',
  'C','CAG','CAH','CARR','CAT','CB','CBOE','CBRE','CCI','CCL','CDAY','CDNS',
  'CDW','CE','CEG','CF','CFG','CHD','CHRW','CHTR','CI','CINF','CL','CLX','CMA',
  'CMCSA','CME','CMG','CMI','CMS','CNC','CNP','COF','COO','COP','COST','CPB',
  'CPRT','CPT','CRL','CRM','CSCO','CSGP','CSX','CTAS','CTLT','CTRA','CTSH',
  'CTVA','CVS','CVX','CZR',
  'D','DAL','DD','DE','DFS','DG','DGX','DHI','DHR','DIS','DISH','DLR','DLTR',
  'DOV','DOW','DPZ','DRI','DTE','DUK','DVA','DVN','DXC',
  'EA','EBAY','ECL','ED','EFX','EIX','EL','EMN','EMR','ENPH','EOG','EPAM',
  'EQIX','EQR','EQT','ES','ESS','ETN','ETR','ETSY','EVRG','EW','EXC','EXPD',
  'EXPE','EXR',
  'F','FANG','FAST','FBHS','FCX','FDS','FDX','FE','FFIV','FIS','FISV','FITB',
  'FLT','FMC','FOX','FOXA','FRC','FRT',
  'GILD','GIS','GL','GLW','GM','GNRC','GOOG','GOOGL','GPC','GPN','GRMN','GS',
  'GWW',
  'HAL','HAS','HBAN','HCA','HD','HOLX','HON','HPE','HPQ','HRL','HSIC','HST',
  'HSY','HUM','HWM',
  'IBM','ICE','IDXX','IEX','IFF','ILMN','INCY','INTC','INTU','INVH','IP',
  'IPG','IQV','IR','IRM','ISRG','IT','ITW','IVZ',
  'J','JBHT','JCI','JKHY','JNJ','JNPR','JPM',
  'K','KDP','KEY','KEYS','KHC','KIM','KLAC','KMB','KMI','KMX','KO','KR',
  'L','LDOS','LEN','LH','LHX','LIN','LKQ','LLY','LMT','LNC','LNT','LOW',
  'LRCX','LUMN','LUV','LVS','LW','LYB','LYV',
  'MA','MAA','MAR','MAS','MCD','MCHP','MCK','MCO','MDLZ','MDT','MET','META',
  'MGM','MHK','MKC','MKTX','MLM','MMC','MMM','MNST','MO','MOH','MOS','MPC',
  'MPWR','MRK','MRNA','MRO','MS','MSCI','MSFT','MSI','MTB','MTCH','MTD','MU',
  'NCLH','NDAQ','NDSN','NEE','NEM','NFLX','NI','NKE','NOC','NOW','NRG','NSC',
  'NTAP','NTRS','NUE','NVDA','NVR','NWL','NWS','NWSA',
  'O','ODFL','OGN','OKE','OMC','ON','ORCL','ORLY','OTIS','OXY',
  'PARA','PAYC','PAYX','PCAR','PCG','PEAK','PEG','PEP','PFE','PFG','PG','PGR',
  'PH','PHM','PKG','PKI','PLD','PM','PNC','PNR','PNW','POOL','PPG','PPL','PRU',
  'PSA','PSX','PTC','PVH','PWR','PXD',
  'QCOM','QRVO',
  'RCL','RE','REG','REGN','RF','RHI','RJF','RL','RMD','ROK','ROL','ROP',
  'ROST','RSG','RTX',
  'SBAC','SBNY','SBUX','SCHW','SEE','SHW','SIVB','SJM','SLB','SNA','SNPS',
  'SO','SPG','SPGI','SRE','STE','STT','STX','STZ','SWK','SWKS','SYF','SYK',
  'SYY',
  'T','TAP','TDG','TDY','TECH','TEL','TER','TFC','TFX','TGT','TMO','TMUS',
  'TPR','TRGP','TRMB','TROW','TRV','TSCO','TSLA','TSN','TT','TTWO','TXN',
  'TXT','TYL',
  'UAL','UDR','UHS','ULTA','UNH','UNP','UPS','URI','USB',
  'V','VFC','VICI','VLO','VMC','VNO','VRSK','VRSN','VRTX','VTR','VTRS','VZ',
  'WAB','WAT','WBA','WBD','WDC','WEC','WELL','WFC','WHR','WM','WMB','WMT',
  'WRB','WRK','WST','WTW','WY','WYNN',
  'XEL','XOM','XRAY','XYL',
  'YUM',
  'ZBH','ZBRA','ZION','ZTS',
];

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
