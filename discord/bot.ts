import 'dotenv/config';
import {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, ChatInputCommandInteraction,
  TextChannel,
} from 'discord.js';
import { getSupabaseServerClient } from '../lib/db';
import { buildScoreEmbed, buildTop10Embed, buildAlertEmbed } from '../lib/discord';
import { detectAlerts, recordAlert } from '../lib/alerts';

const TOKEN = process.env.DISCORD_BOT_TOKEN!;
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = [
  new SlashCommandBuilder()
    .setName('sentinel')
    .setDescription('Get the Sentinel score breakdown for a stock')
    .addStringOption((opt) =>
      opt.setName('symbol').setDescription('Stock symbol (e.g. AAPL)').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('top10')
    .setDescription("Show today's top 10 stocks by Sentinel Score"),
  new SlashCommandBuilder()
    .setName('scan')
    .setDescription('Run alert detection and post any new alerts'),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user!.id, GUILD_ID), {
    body: commands.map((c) => c.toJSON()),
  });
  console.log('Slash commands registered.');
}

async function handleSentinel(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const symbol = interaction.options.getString('symbol', true).toUpperCase();
  const db = getSupabaseServerClient();

  const { data: score } = await db
    .from('sentinel_scores')
    .select('*, stocks!inner(name, sector)')
    .eq('symbol', symbol)
    .single();

  if (!score) {
    await interaction.editReply(`No data found for **${symbol}**. Is it in the Sentinel universe?`);
    return;
  }

  const stock = score.stocks as unknown as { name: string; sector: string | null };
  const embed = buildScoreEmbed({
    symbol,
    name: stock.name,
    sentinel_score: score.sentinel_score as number,
    technical_score: score.technical_score as number | null,
    fundamental_score: score.fundamental_score as number | null,
    earnings_ai_score: score.earnings_ai_score as number | null,
    insider_score: score.insider_score as number | null,
    institutional_score: score.institutional_score as number | null,
    rank: score.rank as number | null,
    score_change_1d: score.score_change_1d as number | null,
    sector: stock.sector,
  });

  await interaction.editReply({ embeds: [embed] });
}

async function handleTop10(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const db = getSupabaseServerClient();

  const { data } = await db
    .from('sentinel_scores')
    .select('symbol, sentinel_score, technical_score, fundamental_score, earnings_ai_score, insider_score, institutional_score, rank, score_change_1d, stocks!inner(name, sector)')
    .not('sentinel_score', 'is', null)
    .order('sentinel_score', { ascending: false })
    .limit(10);

  if (!data || data.length === 0) {
    await interaction.editReply('No scored stocks found. Run score computation first.');
    return;
  }

  const stocks = data.map((row) => {
    const s = row.stocks as unknown as { name: string; sector: string | null };
    return {
      symbol: row.symbol as string,
      name: s.name,
      sentinel_score: row.sentinel_score as number,
      technical_score: row.technical_score as number | null,
      fundamental_score: row.fundamental_score as number | null,
      earnings_ai_score: row.earnings_ai_score as number | null,
      insider_score: row.insider_score as number | null,
      institutional_score: row.institutional_score as number | null,
      rank: row.rank as number | null,
      score_change_1d: row.score_change_1d as number | null,
      sector: s.sector,
    };
  });

  const embed = buildTop10Embed(stocks);
  await interaction.editReply({ embeds: [embed] });
}

async function handleScan(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const alerts = await detectAlerts();
  if (alerts.length === 0) {
    await interaction.editReply('No new alerts detected.');
    return;
  }

  let posted = 0;
  for (const alert of alerts) {
    const channelId = process.env[alert.channel_env];
    if (!channelId) continue;

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !(channel instanceof TextChannel)) continue;

      const embed = buildAlertEmbed({
        symbol: alert.symbol,
        name: alert.name,
        alert_type: alert.alert_type,
        sentinel_score: alert.sentinel_score,
        detail: alert.detail,
        sector: alert.sector,
      });

      const msg = await channel.send({ embeds: [embed] });
      await recordAlert(alert, msg.id);
      posted++;
    } catch (err) {
      console.error(`Failed to post alert for ${alert.symbol}:`, err);
    }
  }

  await interaction.editReply(`Posted ${posted} alert(s) out of ${alerts.length} detected.`);
}

client.on('ready', async () => {
  console.log(`Logged in as ${client.user!.tag}`);
  await registerCommands();
  console.log('Sentinel Discord bot is ready.');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'sentinel':
        await handleSentinel(interaction);
        break;
      case 'top10':
        await handleTop10(interaction);
        break;
      case 'scan':
        await handleScan(interaction);
        break;
    }
  } catch (err) {
    console.error(`Command error (${interaction.commandName}):`, err);
    const reply = { content: 'An error occurred processing the command.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply.content);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(TOKEN);
