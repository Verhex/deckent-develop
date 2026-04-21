# Discord Moderator

## Trigger Patterns
- discord, bot, moderate, guild, channel, role
- "ban user", "kick member", "manage roles", "auto-mod", "discord slash command"

## Overview
Expert guidance for building Discord bots with moderation capabilities using `discord.js`. Covers client setup, slash commands, permission management, auto-moderation, and audit logging.

## Bot Setup
```typescript
import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

await client.login(process.env.DISCORD_BOT_TOKEN);
```

## Slash Command Registration
```typescript
const commands = [
  new SlashCommandBuilder().setName('ban').setDescription('Ban a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Ban reason')),
  new SlashCommandBuilder().setName('warn').setDescription('Warn a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Warning reason')),
];

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN!);
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
```

## Moderation Actions
```typescript
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ban') {
    // Permission check
    if (!interaction.memberPermissions?.has('BanMembers')) {
      return interaction.reply({ content: 'You lack BanMembers permission.', ephemeral: true });
    }
    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    await interaction.guild?.members.ban(target, { reason, deleteMessageSeconds: 86400 });
    await interaction.reply(`Banned ${target.tag}: ${reason}`);
  }
});

// Kick
await guild.members.kick(userId, 'Rule violation');

// Timeout (mute) — 10 minutes
await member.timeout(10 * 60 * 1000, 'Spamming');

// Remove timeout
await member.timeout(null);
```

## Auto-Moderation
```typescript
// Word filter
const bannedWords = ['badword1', 'badword2'];

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  const content = message.content.toLowerCase();
  if (bannedWords.some(w => content.includes(w))) {
    await message.delete();
    await message.channel.send(`${message.author}, that language is not allowed.`);
    // Log to mod channel
    const modChannel = message.guild?.channels.cache.find(c => c.name === 'mod-log');
    if (modChannel?.isTextBased()) {
      await (modChannel as any).send(`Auto-mod: deleted message from ${message.author.tag} in #${message.channel.name}`);
    }
  }
});
```

## Role Management
```typescript
// Add role
await member.roles.add(roleId, 'Verified user');

// Remove role
await member.roles.remove(roleId, 'Probation');

// Create role
const role = await guild.roles.create({
  name: 'Muted',
  permissions: [],
  reason: 'Auto-mod mute role',
});
```

## Error Handling
- **50013 Missing Permissions** — Bot role must be higher than target in hierarchy.
- **50035 Invalid Form Body** — Reason string too long (max 512 chars).
- **10007 Unknown Member** — User left guild. Catch and skip gracefully.
- **429 Rate Limited** — Discord rate limits are per-route. Use built-in rate limiter in discord.js.

## Best Practices
- Always check bot permissions before moderation actions with `guild.members.me?.permissions`.
- Use ephemeral replies for mod commands to keep channels clean.
- Log all mod actions to a dedicated channel with timestamp, moderator, target, and reason.
- Never hardcode guild/channel IDs — use config or environment variables.
- Use `deleteMessageSeconds` on ban (max 604800 = 7 days) to clean up spam.
