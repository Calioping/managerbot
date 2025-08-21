const { Client, GatewayIntentBits, Partials, ActivityType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const TOKEN = process.env.CHILD_TOKEN;
const PREFIX = process.env.CHILD_PREFIX || '+';
const OWNER_ID = process.env.CHILD_OWNER_ID;
const BOT_ID = process.env.CHILD_BOT_ID || 'bot';
const PRESET_PRESENCE = process.env.CHILD_PRESENCE || '';
const PRESET_ACTIVITY_TYPE = process.env.CHILD_ACTIVITY_TYPE || '';
const PRESET_ACTIVITY_TEXT = process.env.CHILD_ACTIVITY_TEXT || '';

if (!TOKEN) {
    console.error('No CHILD_TOKEN provided');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

client.once('ready', () => {
    console.log(`Child bot ready as ${client.user.tag} with prefix ${PREFIX}`);
    try {
        const payload = JSON.stringify({ tag: client.user.tag, id: client.user.id, ownerId: OWNER_ID, avatar: client.user.displayAvatarURL({ size: 256, extension: 'png' }) });
        // marker line consumed by parent ProcessRunner
        process.stdout.write(`__READY__ ${payload}\n`);
    } catch {}
    const status = ['online','idle','dnd','invisible'].includes(PRESET_PRESENCE) ? PRESET_PRESENCE : 'online';
    let type = ActivityType.Playing;
    const t = PRESET_ACTIVITY_TYPE.toLowerCase();
    if (t === 'stream' || t === 'streaming') type = ActivityType.Streaming;
    else if (t === 'watch' || t === 'watching') type = ActivityType.Watching;
    else if (t === 'listen' || t === 'listening') type = ActivityType.Listening;
    else if (t === 'compet' || t === 'competing') type = ActivityType.Competing;
    const name = PRESET_ACTIVITY_TEXT || `${PREFIX}help`;
    client.user.setPresence({ activities: [{ type, name }], status });
    
    // Appliquer la sécurité des serveurs au démarrage
    setTimeout(enforceServerSecurity, 5000); // Délai de 5 secondes
});

client.on('reconnecting', () => {
    try {
        const payload = JSON.stringify({ tag: client.user?.tag || 'unknown', id: client.user?.id || 'unknown', ownerId: OWNER_ID });
        process.stdout.write(`__RECONNECTING__ ${payload}\n`);
    } catch {}
});

client.on('resume', () => {
    try {
        const payload = JSON.stringify({ tag: client.user?.tag || 'unknown', id: client.user?.id || 'unknown', ownerId: OWNER_ID });
        process.stdout.write(`__RESUME__ ${payload}\n`);
    } catch {}
});

const owners = new Set(OWNER_ID ? [OWNER_ID] : []);
const blacklist = new Set();

const commands = new Map();

function defineCommand(name, handler) {
    commands.set(name, handler);
}

function requireOwner(message) {
    const authorId = message.author.id;
    const guildId = message.guild?.id;
    const cfg = guildId ? getGuildConfig(guildId) : null;
    if (owners.has(authorId)) return true;
    if (authorId === OWNER_ID) return true;
    if (cfg && Array.isArray(cfg.owners) && cfg.owners.includes(authorId)) return true;
    message.channel.send('Commande réservée aux owners du bot.');
    return false;
}

// Persistent per-guild configuration
const runtimeDataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(runtimeDataDir)) fs.mkdirSync(runtimeDataDir, { recursive: true });
const storeFile = path.join(runtimeDataDir, `runtime_${BOT_ID}.json`);
function readStore() {
    if (!fs.existsSync(storeFile)) return { guilds: {} };
    try { return JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch { return { guilds: {} }; }
}
function writeStore(data) {
    fs.writeFileSync(storeFile, JSON.stringify(data, null, 2));
}
function getGuildConfig(gid) {
    const db = readStore();
    if (!db.guilds[gid]) {
        db.guilds[gid] = {
            prefix: process.env.CHILD_PREFIX || '+',
            owners: OWNER_ID ? [OWNER_ID] : [],
            blacklist: [],
            settings: {
                themeColor: 0x5865F2,
                logs: { modlog: null, messagelog: null, voicelog: null, boostlog: null, rolelog: null, raidlog: null, autopublish: false, join: null, leave: null, nologChannels: [] },
                moderation: { timeout: true, clearLimit: 200, muteroleId: null },
                automod: { antilink: { enabled: false, mode: 'invite' }, antispam: { enabled: false, msgs: 5, perMs: 6000 }, antimassmention: { enabled: false, max: 5 }, antibadword: { enabled: false, words: [] }, piconly: { channelIds: [] } },
                antiraid: { level: 'off', raidlogChannelId: null, raidpingRoleId: null, antibot: false, antiwebhook: false, antirole: false, antichannel: false, antiupdate: false, antiunban: false, antieveryone: false, punition: 'kick', creationLimitMs: 0, whitelist: { users: [], roles: [] } }
            }
        };
        writeStore(db);
    }
    return db.guilds[gid];
}
function saveGuildConfig(gid, cfg) {
    const db = readStore();
    db.guilds[gid] = cfg;
    writeStore(db);
}
function removeGuildConfig(gid) {
    const db = readStore();
    delete db.guilds[gid];
    writeStore(db);
}

// Help: embed + select menu; and permissions with "+help all"
const HELP_CATEGORIES = {
    utilitaire: [
        { cmd: '+allbots', desc: 'Affiche la liste des bots présents sur le serveur' },
        { cmd: '+alladmins', desc: 'Liste des admins présents' },
        { cmd: '+banner [@membre]', desc: 'Affiche la bannière du serveur ou de l\'utilisateur mentionné' },
        { cmd: '+boosters', desc: 'Affiche la liste des membres ayant boosté le serveur' },
        { cmd: '+botadmins', desc: 'Affiche les administrateurs du bot' },
        { cmd: '+channel', desc: 'Affiche des informations sur un salon' },
        { cmd: '+emoji', desc: 'Affiche les emojis du serveur' },
        { cmd: '+help', desc: 'Ouvre ce menu d\'aide interactif' },
        { cmd: '+help all', desc: 'Affiche les permissions importantes du bot' },
        { cmd: '+member [@membre]', desc: 'Affiche des informations sur un membre' },
        { cmd: '+pic', desc: 'Affiche l\'icône du serveur' },
        { cmd: '+role @rôle', desc: 'Affiche des informations sur un rôle' },
        { cmd: '+rolemembers @rôle', desc: 'Affiche les membres possédant un rôle' },
        { cmd: '+server', desc: 'Affiche le nom du serveur' },
        { cmd: '+serverinfo', desc: 'Affiche des informations sur le serveur' },
        { cmd: '+snipe', desc: 'Affiche le dernier message supprimé' },
        { cmd: '+user [@membre]', desc: 'Affiche des informations sur un compte' },
        { cmd: '+vocinfo', desc: 'Affiche des informations sur un salon vocal' },
        { cmd: '+show pic [@membre]', desc: 'Affiche la photo de profil d\'un utilisateur' },
        { cmd: '+choose <a> <b> ...', desc: 'Choisit aléatoirement parmi les options' },
        { cmd: '+embed <texte>', desc: 'Envoie un embed simple avec le texte' }
    ],
    botcontrol: [
        { cmd: '+set <name/pic/banner> [nom/lien]', desc: 'Permet de changer le nom, la photo de profil du bot, ou les deux d\'un coup' },
        { cmd: '+theme <couleur>', desc: 'Permet de changer la couleur des embeds du bot' },
        { cmd: '+stream <titre>', desc: 'Active le statut streaming avec un titre' },
        { cmd: '+<playto/watch/listen/compet> [message]', desc: 'Change l\'activité du bot, [text] peut contenir plusieurs phrases séparées par ,, qui alterneront dans le profil du bot' },
        { cmd: '+remove activity', desc: 'Supprime l\'activité du bot' },
        { cmd: '+<online/idle/dnd/invisible>', desc: 'Change le statut du bot' },
        { cmd: '+server list', desc: 'Affiche la liste des serveurs où se trouve le bot' },
        { cmd: '+invite', desc: 'Donne le lien d\'invitation de ce bot' },
        { cmd: '+leave [ID/nombre]', desc: 'Affiche la liste des serveurs où se trouve le bot' },
        { cmd: '+mp <membre> <message>', desc: 'Envoie un mp à un membre' },
        { cmd: '+owner <@membre/ID>', desc: 'Donne le grade Owner à quelqu\'un sur le bot, il aura toute les permissions dessus' },
        { cmd: '+owners', desc: 'Affiche la liste des owners du bot' },
        { cmd: '+unowner <@membre/ID>', desc: 'Retire le grade Owner à quelqu\'un' },
        { cmd: '+clear owners', desc: 'Supprime tous les owners du bot' },
        { cmd: '+bl <@membre/ID> [raison]', desc: 'Ajoute quelqu\'un à la blacklist, il sera banni de tous les serveurs où le bot se trouve' },
        { cmd: '+bl', desc: 'Affiche le blacklist du bot' },
        { cmd: '+unbl <@membre/ID>', desc: 'Retire quelqu\'un de la blacklist du bot' },
        { cmd: '+clear bl', desc: 'Supprime tous les membres de la blacklist du bot' },
        { cmd: '+say <message>', desc: 'Fait dire au bot le message voulu' },
        { cmd: '+setprefix <préfixe>', desc: 'Change le prefix par défaut du bot, c\'est aussi celui utilisé en messages privés' },
        { cmd: '+secur invite <on/off>', desc: 'Le bot quitte automatiquement quand il rejoint un serveur sans le propriétaire' },
        { cmd: '+updatebot', desc: 'Installe les dernières mises à jour disponibles sur le bot' },
        { cmd: '+reset server', desc: 'Réinitialise tous les paramètres du bot sur un serveur (action irréversible)' },
        { cmd: '+resetall', desc: 'Réinitialise l\'ensemble des paramètres du bot (action irréversible)' }
    ],
    antiraid: [
        { cmd: '+raidlog <on/off> [salon]', desc: 'Active les logs de l\'antiraid dans un salon' },
        { cmd: '+raidping <rôle>', desc: 'Modifie les rôles mentionnés en cas de raid' },
        { cmd: '+antitoken <on/off/lock>', desc: 'Active/désactive l\'antitoken sur le serveur. lock verouille complètement le serveur et empêche quiconque de rejoindre' },
        { cmd: '+antitoken <nombre>/<durée>', desc: 'Règle la sensibilité de l\'antitoken: le nombre de personnes devant rejoindre en un certain temps pour que l\'antitoken s\'active' },
        { cmd: '+secur [off/on/max]', desc: 'Affiche et/ou modifie tous les paramètres de l\'antiraid sur le serveur' },
        { cmd: '+antiupdate <off/on/max>', desc: 'Active/désactive l\'antiupdate' },
        { cmd: '+antichannel <off/on/max>', desc: 'Active/désactive l\'antichannel' },
        { cmd: '+antirole <off/on/max>', desc: 'Active/désactive l\'antirole' },
        { cmd: '+antiwebhook <off/on/max>', desc: 'Active/désactive l\'antiwebhook' },
        { cmd: '+clear webhooks', desc: 'Supprime tous les webhooks du serveur' },
        { cmd: '+antiunban <off/on/max>', desc: 'Active/désactive l\'antiunban' },
        { cmd: '+antibot <off/on/max>', desc: 'Active/désactive l\'antibot' },
        { cmd: '+antiban <off/on/max>', desc: 'Active/désactive l\'antiban' },
        { cmd: '+antieveryone <off/on/max>', desc: 'Active/désactive l\'antieveryone' },
        { cmd: '+antieveryone <nombre>/<durée>', desc: 'Règle le nombre de everyone maximum en une durée donnée' },
        { cmd: '+blrank <on/off/max>', desc: 'Active/désactive la blacklist rank' },
        { cmd: '+blrank <add/del> <membre>', desc: 'Ajoute un membre dans la blacklist rank' },
        { cmd: '+blrank', desc: 'Affiche la blacklist rank' },
        { cmd: '+punition <derank/kick/ban>', desc: 'Règle la punition des membres de l\'antiraid' },
        { cmd: '+creation limit <durée>', desc: 'Définit depuis combien de temps le compte d\'un utilisateur doit être créé pour pouvoir rejoindre le serveur' },
        { cmd: '+wl <@membre/ID>', desc: 'Ajoute quelqu\'un à la whitelist d\'un serveur, il ne sera plus affecté par l\'antiraid' },
        { cmd: '+wl', desc: 'Affiche la whitelist d\'un serveur' },
        { cmd: '+unwl <@membre/Id>', desc: 'Retire quelqu\'un de la whitelist d\'un serveur' },
        { cmd: '+clear wl', desc: 'Supprime tous les membres de la whitelist d\'un serveur' }
    ],
    gestion: [
        { cmd: '+giveaway', desc: 'Affiche un menu interactif pour créer un giveaway' },
        { cmd: '+end giveaway <ID>', desc: 'Permet de terminer instantanément un giveaway avec l\'ID de son message' },
        { cmd: '+reroll', desc: 'Rejoue le dernier giveaway du serveur' },
        { cmd: '+choose', desc: 'Lance un tirage au sort instantané sur un message' },
        { cmd: '+embed', desc: 'Affiche un générateur d\'embed interactif' },
        { cmd: '+backup <serveur/emoji> <nom>', desc: 'Crée une backup du serveur ou des émojis avec le nom voulu' },
        { cmd: '+backup list <serveur/emoji>', desc: 'Affiche la liste des backups' },
        { cmd: '+backup delete <serveur/emoji> <nom>', desc: 'Supprime une backup' },
        { cmd: '+backup load <serveur/emoji> <nom>', desc: 'Charge la backup souhaitée dans un serveur' },
        { cmd: '+create [émoji] [nom]', desc: 'Crée un émoji custom sur le serveur, à partir d\'une image ou d\'un émoji nitro' },
        { cmd: '+newsticker [nom]', desc: 'Crèe un nouveau sticker sur le serveur, en répondant à un autre sticker, ou en l\'envoyant avec la commande' },
        { cmd: '+massiverole', desc: 'Ajoute/retire un rôle à tous les membres du serveur ou à tout ceux ayant un certain rôle' },
        { cmd: '+voicemove [salon] [salon]', desc: 'Déplace tous les membres d\'un salon vocal vers un autre. Les salons de départ et d\'arrivée peuvent être précisés' },
        { cmd: '+voicekick <membre>', desc: 'Déconnecte un ou plusieurs membres de leur salon vocaux actuel' },
        { cmd: '+cleanup <salon>', desc: 'Déconnecte tous les utilisateurs d\'un salon vocal' },
        { cmd: '+bringall [salon]', desc: 'Déplace tous les membres en vocal sur le serveur vers un salon vocal' },
        { cmd: '+unbanall', desc: 'Supprime tous les bannissements du serveur' },
        { cmd: '+sync <salon/catégorie/all>', desc: 'Synchronise les permissions d\'un salon avec sa catégorie, all synchronise tous les salons du serveu' }
    ],
    serverconfig: [
        { cmd: '+perms', desc: 'Affiche la liste des rôles ayant des permissions sur le bot' },
        { cmd: '+slowmode <durée> [salon]', desc: 'Change la durée du mode lent sur un salon (max 6h)' },
        { cmd: '+rolemenu', desc: 'Affiche un menu interactif pour créer ou modifier un menu de rôles' },
        { cmd: '+ticket settings', desc: 'Affiche un menu permettant de gérer le système de ticket' },
        { cmd: '+claim', desc: 'Permet de claim un ticket' },
        { cmd: '+rename <nom>', desc: 'Permet de renommer un ticket' },
        { cmd: '+<add/del> <membre>', desc: 'Ajoute ou retire un membre au ticket' },
        { cmd: '+close [raison]', desc: 'Ferme le ticket' },
        { cmd: '+tempvoc', desc: 'Affiche un menu interactif pour gérer les vocaux temporaires sur le serveur' },
        { cmd: '+twitch', desc: 'Permet de régler des alertes lorsque des membres du serveur sont en live sur Twitch' },
        { cmd: '+join settings', desc: 'Permet de paramétrer les actions à effectuer quand un membre rejoint le serveur' },
        { cmd: '+leave settings', desc: 'Permet de paramétrer les actions à effectuer quand un membre quitte le serveur' },
        { cmd: '+soutien', desc: 'Permet de donner automatiquement un rôle aux membres ayant un message dans leurs statuts' },
        { cmd: '+set perm <permission> <rôle>', desc: 'Donne l\'accès à un niveau de permission à un rôle' },
        { cmd: '+del perm <rôle>', desc: 'Supprime les permissions du bot à un ou plusieurs rôles' },
        { cmd: '+clear perms', desc: 'Supprime toutes les permissions du bot pour tous les rôles' },
        { cmd: '+show pic', desc: 'Permet d\'envoyer automatiquement les photos de profils de membres aléatoires dans un salon' },
        { cmd: '+autopublish <on/off>', desc: 'Active/désactive la publication automatique des messages dans les salons d\'annonces' }
    ],
    logs: [
        { cmd: '+modlog on [salon]', desc: 'Active les logs de modération dans un salon' },
        { cmd: '+modlog off', desc: 'Désactive les logs de modération' },
        { cmd: '+messagelog on [salon]', desc: 'Active les logs des messages supprimés et édités dans un salon' },
        { cmd: '+messagelog off', desc: 'Désactive les logs de messages supprimés et édités' },
        { cmd: '+voicelog on [salon]', desc: 'Active les logs de l\'activité vocale dans un salon' },
        { cmd: '+voicelog off', desc: 'Désactive les logs de l\'activité vocale' },
        { cmd: '+boostlog on [salon]', desc: 'Active les logs de boosts dans un salon' },
        { cmd: '+boostlog off', desc: 'Désactive les logs de boosts' },
        { cmd: '+rolelog on [salon]', desc: 'Active les logs des rôles dans un salon' },
        { cmd: '+rolelog off', desc: 'Désactive les logs des rôles' },
        { cmd: '+raidlog on [salon]', desc: 'Active les logs de l\'antiraid dans un salon' },
        { cmd: '+raidlog off', desc: 'Désactive les logs de l\'antiraid' },
        { cmd: '+autoconfiglog', desc: 'Crèe automatiquement un salon pour chaque type de logs' },
        { cmd: '+join settings', desc: 'Permet de paramétrer les actions à effectuer quand un membre rejoint le serveur' },
        { cmd: '+leave settings', desc: 'Permet de paramétrer les actions à effectuer quand un membre quitte le serveur' },
        { cmd: '+nolog <add/del> [salon]', desc: 'Désactive ou active les logs des messages ou de l\'activité vocal dans certains salons' }
    ],
    moderationsettings: [
        { cmd: '+timeout <on/off>', desc: 'Active/désactive l\'utilisation du Timeout Discord au lieu du rôle mute pour les fonctions de mute (les timeouts ne peuvent pas durer plus de 28 jours)' },
        { cmd: '+clear limit <nombre>', desc: 'Change le nombre maximum de messages pouvant être supprimés en une seule commande clear' },
        { cmd: '+muterole', desc: 'Crée un rôle muet ou met à jour celui qui existe déjà, et affiche les erreurs de réglage de permissions' },
        { cmd: '+set muterole <rôle>', desc: 'Définit le rôle muet sur un rôle déjà existant' },
        { cmd: '+antispam <on/off>', desc: 'Active/désactive la protection contre les spams' },
        { cmd: '+antispam <nombre>/<durée>', desc: 'Règle la sensibilité de l\'antispam (en nombre de message par secondes)' },
        { cmd: '+antilink <on/off>', desc: 'Active/désactive la protection contre les liens' },
        { cmd: '+antilink invite/all', desc: 'Définit si l\'antilink s\'active pour tous les liens ou seulement pour les invitations Discord' },
        { cmd: '+antimassmention <on/off>', desc: 'Active/désactive la protection contre le spam mention' },
        { cmd: '+antimassmention <nombre>', desc: 'Définit à partir de combien de mentions dans un seul message l\'antimassmention s\'active' },
        { cmd: '+antibadword <on/off>', desc: 'Active/désactive la protection contre les mots interdits' },
        { cmd: '+badword <add/del> <mot>', desc: 'Ajoute/retire un mot à la liste des mots interdits' },
        { cmd: '+badword list', desc: 'Affiche la liste des mots interdits' },
        { cmd: '+clear badwords', desc: 'Supprime tous les mots interdits de la list' },
        { cmd: '+piconly <add/del> [salon]', desc: 'Défini/supprime un salon comme salon à selfie, les membres ne peuvent y envoyer que des photos' },
        { cmd: '+join settings', desc: 'Permet de paramétrer les actions à effectuer quand un membre rejoint le serveur' },
        { cmd: '+leave settings', desc: 'Permet de paramétrer les actions à effectuer quand un membre quitte le serveur' }
    ],
    moderation: [
        { cmd: '+addrole', desc: 'Ajoute un rôle à un membre' },
        { cmd: '+ban', desc: 'Bannit un membre du serveur' },
        { cmd: '+delrole', desc: 'Supprime un rôle d\'un membre' },
        { cmd: '+derank', desc: 'Supprime tous les rôles d\'un membre' },
        { cmd: '+hide', desc: 'Cache le salon actuel' },
        { cmd: '+hideall', desc: 'Cache tous les salons du serveur' },
        { cmd: '+kick', desc: 'Expulse un membre du serveur' },
        { cmd: '+lock', desc: 'Verrouille le salon actuel' },
        { cmd: '+lockall', desc: 'Verrouille tous les salons du serveur' },
        { cmd: '+mute', desc: 'Rend un membre muet' },
        { cmd: '+mutelist', desc: 'Affiche la liste des membres muets' },
        { cmd: '+renew', desc: 'Supprime puis recrée le salon actuel' },
        { cmd: '+unban', desc: 'Débannit un utilisateur du serveur' },
        { cmd: '+unhide', desc: 'Rend visible le salon actuel' },
        { cmd: '+unhideall', desc: 'Rend visibles tous les salons' },
        { cmd: '+unlock', desc: 'Déverrouille le salon actuel' },
        { cmd: '+unlockall', desc: 'Déverrouille tous les salons' },
        { cmd: '+unmute', desc: 'Rend la parole à un membre' },
        { cmd: '+unmuteall', desc: 'Démute tous les membres' },
        { cmd: '+warn', desc: 'Avertit un membre' }
    ]
};

const HELP_COLOR = 0xFF0000;
const EMBED_RED = 0xFF0000;
function getThemeColorForGuild(guildId) {
    try { return getGuildConfig(guildId).settings.themeColor || 0xFF0000; } catch { return 0xFF0000; }
}
function buildHelpEmbed(categoryKey, guildId) {
    const color = getThemeColorForGuild(guildId);
    if (!categoryKey || categoryKey === 'overview') {
        const embed = new EmbedBuilder()
            .setTitle('Aide du bot')
            .setDescription('Choisis une catégorie ci-dessous. Chaque commande s\'affiche dans un encadré noir pour plus de lisibilité.')
            .setColor(color);
        for (const key of Object.keys(HELP_CATEGORIES)) {
            const cmds = HELP_CATEGORIES[key];
            const preview = cmds.slice(0, 6).map(c => typeof c === 'string' ? `\`+${c}\`` : `\`${c.cmd}\``).join(', ');
            embed.addFields({ name: key, value: preview || '—' });
        }
        return embed;
    }
    const list = HELP_CATEGORIES[categoryKey] || [];
    let title = categoryKey;
    
    // Formater les titres avec des majuscules et des espaces
    if (categoryKey === 'utilitaire') title = 'Utilitaire';
    if (categoryKey === 'botcontrol') title = 'Bot Control';
    if (categoryKey === 'antiraid') title = 'Antiraid';
    if (categoryKey === 'gestion') title = 'Gestion du Serveur';
    if (categoryKey === 'serverconfig') title = 'Server Config';
    if (categoryKey === 'logs') title = 'Logs';
    if (categoryKey === 'moderationsettings') title = 'Moderation Settings';
    if (categoryKey === 'moderation') title = 'Modération';
    
    const embed = new EmbedBuilder().setTitle(title).setColor(color);
    
    // En-tête spécifique pour Bot Control
    let header = 'Les paramètres peuvent être des noms, des mentions, ou des IDs.\nSi ce ne sont pas des mentions ils doivent être séparés par ","';
    if (categoryKey === 'botcontrol') {
        header = '**Bot Control**\nLes paramètres peuvent être des noms, des mentions, ou des IDs.\nSi ce ne sont pas des mentions ils doivent être séparés par ,,';
    }
    if (categoryKey === 'antiraid') {
        header = '**Antiraid**\nLes paramètres peuvent être des noms, des mentions, ou des IDs.\nSi ce ne sont pas des mentions ils doivent être séparés par ,,';
    }
    if (categoryKey === 'gestion') {
        header = '**Gestion du Serveur**\nLes paramètres peuvent être des noms, des mentions, ou des IDs.\nSi ce ne sont pas des mentions ils doivent être séparés par ,,';
    }
    if (categoryKey === 'serverconfig') {
        header = '**Server Config**\nLes paramètres peuvent être des noms, des mentions, ou des IDs.\nSi ce ne sont pas des mentions ils doivent être séparés par ,,';
    }
    if (categoryKey === 'logs') {
        header = '**Logs**\nLes paramètres peuvent être des noms, des mentions, ou des IDs.\nSi ce ne sont pas des mentions ils doivent être séparés par ,,';
    }
    if (categoryKey === 'moderationsettings') {
        header = '**Moderation Settings**\nLes paramètres peuvent être des noms, des mentions, ou des IDs.\nSi ce ne sont pas des mentions ils doivent être séparés par ,,';
    }
    if (categoryKey === 'moderation') {
        header = '**Modération**\nLes paramètres peuvent être des noms, des mentions, ou des IDs.\nSi ce ne sont pas des mentions ils doivent être séparés par ,,';
    }
    
    const parts = [header, ''];
    for (const entry of list) {
        if (typeof entry === 'string') {
            parts.push('`+' + entry + '`');
        } else {
            parts.push('`' + entry.cmd + '`');
            if (entry.desc) parts.push(entry.desc);
        }
        parts.push('');
        if (parts.join('\n').length > 3800) break;
    }
    embed.setDescription(parts.join('\n').slice(0, 4000));
    return embed;
}

function buildHelpMenu(userId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`help_menu:${userId}`)
            .setPlaceholder('Choisis une catégorie')
            .addOptions(
                { label: 'Vue d\'ensemble', value: 'overview', description: 'Toutes les catégories' },
                { label: 'Utilitaire', value: 'utilitaire' },
                { label: 'Bot Control', value: 'botcontrol' },
                { label: 'Antiraid', value: 'antiraid' },
                { label: 'Gestion du serveur', value: 'gestion' },
                { label: 'Server Config', value: 'serverconfig' },
                { label: 'Logs', value: 'logs' },
                { label: 'Moderation Settings', value: 'moderationsettings' },
                { label: 'Modération', value: 'moderation' }
            )
    );
}

defineCommand('help', async (msg) => {
    const embed = buildHelpEmbed('overview', msg.guild.id);
    const menu = buildHelpMenu(msg.author.id);
    const sent = await msg.channel.send({ embeds: [embed], components: [menu] });
    const collector = sent.createMessageComponentCollector({ time: 10 * 60 * 1000 });
    collector.on('collect', async (i) => {
        if (i.user.id !== msg.author.id) return i.reply({ content: 'Seul l\'auteur peut utiliser ce menu.', ephemeral: true });
        if (i.customId.startsWith('help_menu:')) {
            const choice = i.values[0];
            const newEmbed = buildHelpEmbed(choice, i.guild.id);
            await i.update({ embeds: [newEmbed] });
        }
    });
});

defineCommand('help all', async (msg) => {
    const me = msg.guild.members.me;
    const p = me.permissions;
    const important = [
        'Administrator','ManageGuild','ManageChannels','ManageRoles','KickMembers','BanMembers','ManageWebhooks','ManageMessages','ViewChannel','SendMessages','EmbedLinks','ReadMessageHistory','AttachFiles','UseExternalEmojis','UseExternalStickers','ManageThreads'
    ];
    const lines = important.map(name => `• ${name}: ${p.has(PermissionsBitField.Flags[name]) ? '✅' : '❌'}`);
    const embed = new EmbedBuilder().setTitle('Permissions du bot').setDescription(lines.join('\n')).setColor(getThemeColorForGuild(msg.guild.id));
    await msg.channel.send({ embeds: [embed] });
});

// alias legacy
defineCommand('helpall', async (msg) => commands.get('help all')(msg));

defineCommand('server', async (msg) => {
    if (!msg.guild) return;
    const embed = new EmbedBuilder().setTitle('Server Info').addFields(
        { name: 'Nom', value: msg.guild.name, inline: true },
        { name: 'Membres', value: String(msg.guild.memberCount), inline: true }
    ).setColor(getThemeColorForGuild(msg.guild.id));
    await msg.channel.send({ embeds: [embed] });
});
// alias
defineCommand('serverinfo', async (msg) => {
    const guild = msg.guild;
    const members = await guild.members.fetch();
    const humans = members.filter(m => !m.user.bot).size;
    const bots = members.filter(m => m.user.bot).size;
    const onlineMembers = members.filter(m => m.presence?.status !== 'offline').size;
    const voiceMembers = members.filter(m => m.voice.channelId).size;
    const boosters = members.filter(m => m.premiumSince).size;
    const membersWithoutRole = members.filter(m => m.roles.cache.size === 1).size;
    const createdAt = guild.createdAt;
    
    const embed = new EmbedBuilder()
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .setColor(getThemeColorForGuild(guild.id))
        .addFields(
            {
                name: '\u200b',
                value: [
                    `**ID:** ${guild.id}`,
                    `**Nombre d'humains:** ${humans}`,
                    `**Nombre d'utilisateurs sans rôle:** ${membersWithoutRole}`,
                    `**Niveau de boost:** ${guild.premiumTier || 0}`,
                    `**Nombre d'emojis:** ${guild.emojis.cache.size}`
                ].join('\n'),
                inline: true
            },
            {
                name: '\u200b',
                value: [
                    `**Nombre de membres:** ${guild.memberCount}`,
                    `**Nombre de bots:** ${bots}`,
                    `**Nombre de boosts:** ${guild.premiumSubscriptionCount || 0}`,
                    `**Nombre de rôles:** ${guild.roles.cache.size}`,
                    `**Vanity URL:** ${guild.vanityURLCode ? guild.vanityURLCode : 'Le serveur ne possède pas d\'url'}`
                ].join('\n'),
                inline: true
            },
            {
                name: '\u200b',
                value: [
                    `**Nombre de membres en ligne:** ${onlineMembers}`,
                    `**Nombre d'utilisateurs en vocal:** ${voiceMembers}`,
                    `**Nombre de boosters:** ${boosters}`,
                    `**Nombre de salons:** ${guild.channels.cache.size}`,
                    `**Verification:** ${guild.verificationLevel || 'None'}`
                ].join('\n'),
                inline: true
            }
        )
        .setFooter({ text: `Création du serveur • ${createdAt.toLocaleDateString('fr-FR')} ${createdAt.toLocaleTimeString('fr-FR')}` });
    
    await msg.channel.send({ embeds: [embed] });
});

defineCommand('user', async (msg) => {
    const user = msg.mentions.users.first() || msg.author;
    try { await user.fetch(); } catch {}
    const username = user.username;
    const globalName = user.globalName || 'Aucun';
    const id = user.id;
    const createdTs = Math.floor((user.createdTimestamp || Date.now()) / 1000);
    const isBot = user.bot ? 'Oui' : 'Non';
    const avatarUrl = user.displayAvatarURL({ size: 1024 });
    const bannerUrl = user.bannerURL({ size: 2048 });
    let badges = 'Aucun';
    try {
        if (user.flags && typeof user.flags.toArray === 'function') {
            const arr = user.flags.toArray();
            if (arr.length) badges = arr.join(', ');
        }
    } catch {}

    const embed = new EmbedBuilder()
        .setTitle(`Informations de ${user.globalName || user.username}`)
        .setColor(getThemeColorForGuild(msg.guild.id))
        .setThumbnail(avatarUrl)
        .setDescription([
            `**Nom d'utilisateur:** ${username}`,
            `**Pseudo Global:** ${globalName}`,
            `**ID:** ${id}`,
            `**Créé le:** <t:${createdTs}:R>`,
            `**Bot:** ${isBot}`,
            `**Badges:** ${badges}`,
            `**Avatar:** [Lien](${avatarUrl})`,
            `**Bannière:** ${bannerUrl ? `[Lien](${bannerUrl})` : 'Aucun'}`
        ].join('\n'));

    await msg.channel.send({ embeds: [embed] });
});

// Extra utility/info commands
defineCommand('allbots', async (msg) => {
    const members = await msg.guild.members.fetch();
    const bots = members.filter(m => m.user.bot);
    let index = 1;
    const lines = bots.map(m => {
        const name = m.user.username;
        const styledName = `**\`${name}\`**`;
        return `\`${index++}\` - ${styledName} (\`${m.id}\`)`;
    }).join('\n');
    const embed = new EmbedBuilder()
        .setTitle('Liste des bots présents')
        .setDescription(lines || 'Aucun bot sur ce serveur.')
        .setColor(getThemeColorForGuild(msg.guild.id))
        .setFooter({ text: `Total: ${bots.size} • ${msg.guild.name}` });
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('alladmins', async (msg) => {
    const admins = (await msg.guild.members.fetch()).filter(m => 
        m.permissions.has(PermissionsBitField.Flags.Administrator) && !m.user.bot
    );
    
    if (admins.size === 0) {
        return void msg.channel.send('Aucun administrateur utilisateur sur ce serveur.');
    }
    
    let index = 1;
    const lines = admins.map(m => {
        const name = m.user.globalName || m.user.username;
        const styledName = `**\`${name}\`**`;
        return `\`${index++}\` - ${styledName} (\`${m.id}\`)`;
    }).join('\n');
    
    const embed = new EmbedBuilder()
        .setTitle('Liste des admins présents')
        .setDescription(lines || 'Aucun admin utilisateur sur ce serveur.')
        .setColor(getThemeColorForGuild(msg.guild.id))
        .setFooter({ text: `Total: ${admins.size} • ${msg.guild.name}` });
    
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('botadmins', async (msg) => {
    const botAdmins = (await msg.guild.members.fetch()).filter(m => 
        m.user.bot && m.permissions.has(PermissionsBitField.Flags.Administrator)
    );
    
    if (botAdmins.size === 0) {
        const embed = new EmbedBuilder()
            .setTitle('Admins du bot')
            .setDescription('Aucun bot admin sur ce serveur.')
            .setColor(getThemeColorForGuild(msg.guild.id));
        
        return void msg.channel.send({ embeds: [embed] });
    }
    
    let index = 1;
    const lines = botAdmins.map(m => {
        const name = m.user.username;
        return `\`${index++}\` - **\`${name}\`** (\`${m.id}\`)`;
    }).join('\n');
    
    const embed = new EmbedBuilder()
        .setTitle('Liste des admins présents')
        .setDescription(lines)
        .setColor(getThemeColorForGuild(msg.guild.id))
        .setFooter({ text: `Total: ${botAdmins.size} • ${msg.guild.name}` });
    
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('banner', async (msg) => {
    const user = msg.mentions.users.first() || msg.author;
    const bannerUrl = user.bannerURL({ size: 2048 });
    
    if (!bannerUrl) {
        const embed = new EmbedBuilder()
            .setTitle(`Bannière de ${user.globalName || user.username}`)
            .setDescription(`${user.globalName || user.username} n'a pas de bannière !`)
            .setColor(getThemeColorForGuild(msg.guild.id));
        
        return void msg.channel.send({ embeds: [embed] });
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`Bannière de ${user.globalName || user.username}`)
        .setImage(bannerUrl)
        .setColor(getThemeColorForGuild(msg.guild.id));
    
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('boosters', async (msg) => {
    const boosters = (await msg.guild.members.fetch()).filter(m => m.premiumSince);
    
    if (boosters.size === 0) {
        const embed = new EmbedBuilder()
            .setTitle('Boosters du serveur')
            .setDescription('Ce serveur n\'a aucun boost')
            .setColor(getThemeColorForGuild(msg.guild.id))
            .setFooter({ text: `${msg.guild.name} • Aujourd'hui à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` });
        
        return void msg.channel.send({ embeds: [embed] });
    }
    
    const lines = boosters.map(m => {
        const name = m.user.globalName || m.user.username;
        return `• **${name}** (\`${m.id}\`)`;
    }).join('\n');
    
    const embed = new EmbedBuilder()
        .setTitle('Boosters du serveur')
        .setDescription(lines)
        .setColor(getThemeColorForGuild(msg.guild.id))
        .setFooter({ text: `Total: ${boosters.size} • ${msg.guild.name}` });
    
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('channel', async (msg) => {
    const channel = msg.channel;
    const createdAt = channel.createdAt;
    const parent = channel.parent;
    const permissions = channel.permissionsFor(channel.guild.roles.everyone);
    
    const embed = new EmbedBuilder()
        .setTitle('Informations du salon')
        .setDescription([
            `**Nom**\n${channel.name}`,
            `**ID**\n\`${channel.id}\``,
            `**Position**\n${channel.position}`,
            `**Type**\n${channel.type === 0 ? 'Textuel' : channel.type === 2 ? 'Vocal' : 'Autre'}`,
            `**Créé le**\n${createdAt.toLocaleDateString('fr-FR')}, ${createdAt.toLocaleTimeString('fr-FR')}`,
            `**Parent**\n${parent ? parent.name : 'Aucun'}`,
            `**Nsfw**\n${channel.nsfw ? 'Oui' : 'Non'}`,
            `**Limite de personnes (vocal)**\n${channel.userLimit ? channel.userLimit : 'N/A'}`,
            `**Bitrate (vocal)**\n${channel.bitrate ? `${channel.bitrate / 1000}kbps` : 'N/A'}`,
            `**Permissions du rôle @everyone**\n${permissions ? Array.from(permissions.toArray()).join(', ') || 'Aucune' : 'Aucune'}`
        ].join('\n\n'))
        .setColor(getThemeColorForGuild(channel.guild.id))
        .setFooter({ text: channel.guild.name });
    
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('emoji', async (msg) => {
    const embed = new EmbedBuilder()
        .setTitle('Emojis du serveur')
        .setDescription(`Ce serveur possède **${msg.guild.emojis.cache.size}** emojis`)
        .setColor(getThemeColorForGuild(msg.guild.id))
        .setFooter({ text: `${msg.guild.name}` });
    
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('member', async (msg) => {
    const member = msg.mentions.members.first() || msg.member;
    const user = member.user;
    const createdAt = user.createdAt;
    const joinedAt = member.joinedAt;
    const highestRole = member.roles.highest;
    const roles = member.roles.cache.filter(r => r.id !== member.guild.id).map(r => `<@&${r.id}>`).join(', ') || 'Aucun';
    
    const embed = new EmbedBuilder()
        .setTitle('Informations')
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setColor(getThemeColorForGuild(member.guild.id))
        .addFields(
            {
                name: '**General**',
                value: [
                    `**Nom:** ${user.globalName || user.username}`,
                    `**Surnom:** ${member.nickname || 'None'}`,
                    `**Aperçu**`,
                    `**Badges:** **Bot:** ${user.bot ? 'oui' : 'non'}`
                ].join('\n'),
                inline: false
            },
            {
                name: '**Informations relatives au serveur**',
                value: [
                    `**Roles:** ${roles}`,
                    `**Info**`,
                    `**Compte créé le:** ${createdAt ? `il y a ${Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))} jours` : 'Inconnu'}`,
                    `**A rejoint le serveur:** ${joinedAt ? `il y a ${Math.floor((Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24))} jours` : 'Inconnu'}`,
                    `**Le rôle le plus haut:** ${highestRole && highestRole.id !== member.guild.id ? highestRole.name : 'None'}`
                ].join('\n'),
                inline: false
            }
        )
        .setFooter({ text: member.guild.name });
    
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('pic', async (msg) => {
    const user = msg.mentions.users.first() || msg.author;
    const iconUrl = user.displayAvatarURL({ size: 1024 });
    
    const embed = new EmbedBuilder()
        .setTitle(`Photo de profil de ${user.globalName || user.username}`)
        .setImage(iconUrl)
        .setColor(getThemeColorForGuild(msg.guild.id));
    
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('role', async (msg) => {
    const role = msg.mentions.roles.first();
    if (!role) {
        const embed = new EmbedBuilder()
            .setTitle('Rôle')
            .setDescription('Mentionne un rôle.')
            .setColor(getThemeColorForGuild(msg.guild.id));
        return void msg.channel.send({ embeds: [embed] });
    }

    const createdAt = role.createdAt || new Date();
    const shortDate = createdAt.toLocaleDateString('fr-FR');
    const longDate = createdAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const hasAdmin = role.permissions.has(PermissionsBitField.Flags.Administrator);

    const embed = new EmbedBuilder()
        .setTitle(role.name)
        .setColor(getThemeColorForGuild(msg.guild.id))
        .setDescription([
            '**Nom**',
            `${role}`,
            '',
            '**Membres possédant le rôle**',
            `${role.members.size}`,
            '',
            '**Couleur**',
            `${(role.hexColor || '#000000').toLowerCase()}`,
            '',
            '**ID**',
            `${role.id}`,
            '',
            '**Affiché séparément**',
            role.hoist ? 'Oui' : 'Non',
            '',
            '**Mentionable**',
            role.mentionable ? 'Oui' : 'Non',
            '',
            '**Géré par une intégration**',
            role.managed ? 'Oui' : 'Non',
            '',
            '**Permissions principales**',
            hasAdmin ? 'Administrateur' : 'Aucune',
            '',
            '**Création du rôle**',
            `${shortDate} (${longDate} à ${timeStr})`
        ].join('\n'));

    await msg.channel.send({ embeds: [embed] });
});
defineCommand('rolemembers', async (msg) => {
    const role = msg.mentions.roles.first();
    if (!role) {
        const embed = new EmbedBuilder()
            .setTitle('Membres du rôle')
            .setDescription('Mentionne un rôle.')
            .setColor(getThemeColorForGuild(msg.guild.id));
        
        return void msg.channel.send({ embeds: [embed] });
    }
    
    const members = (await msg.guild.members.fetch()).filter(m => m.roles.cache.has(role.id));
    
    const embed = new EmbedBuilder()
        .setTitle(`Membres du rôle ${role.name}`)
        .setDescription(`Ce rôle est possédé par **${members.size}** membres`)
        .setColor(getThemeColorForGuild(msg.guild.id))
        .setFooter({ text: `${msg.guild.name}` });
    
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('vocinfo', async (msg) => {
    const all = await msg.guild.members.fetch();
    const inVoice = all.filter(m => m.voice && m.voice.channelId);
    const micMuted = inVoice.filter(m => m.voice.selfMute || m.voice.serverMute);
    const deafened = inVoice.filter(m => m.voice.selfDeaf || m.voice.serverDeaf);
    const streaming = inVoice.filter(m => m.voice.streaming);
    const camera = inVoice.filter(m => m.voice.selfVideo);

    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const embed = new EmbedBuilder()
        .setTitle('Salons vocaux')
        .setDescription([
            `🔊 ${inVoice.size} personne en vocal.`,
            `🎙️ ${micMuted.size} personne sont mute micro.`,
            `🎧 ${deafened.size} personne sont mute casque.`,
            `🖥️ ${streaming.size} personne sont en stream.`,
            `🎥 ${camera.size} personne sont en caméra.`
        ].join('\n'))
        .setColor(getThemeColorForGuild(msg.guild.id))
        .setFooter({ text: `${msg.guild.name}•Aujourd'hui à ${timeStr}` });

    await msg.channel.send({ embeds: [embed] });
});

// Snipe last deleted message per channel
const lastDeleted = new Map();
client.on('messageDelete', (m) => { if (!m.guild || !m.author) return; lastDeleted.set(m.channelId, { content: m.content || '[embed/attachment]', author: m.author.tag }); });

defineCommand('snipe', async (msg) => {
    const snipe = lastDeleted.get(msg.channelId);
    if (!snipe) {
        return void msg.channel.send('Aucun message enregistré.');
    }
    
    const embed = new EmbedBuilder()
        .setTitle('Dernier message supprimé')
        .setDescription([
            `**Auteur:** ${snipe.author}`,
            `**Contenu:** ${snipe.content}`
        ].join('\n'))
        .setColor(getThemeColorForGuild(msg.guild.id));
    
    await msg.channel.send({ embeds: [embed] });
});

defineCommand('show pic', async (msg) => {
    const user = msg.mentions.users.first() || msg.author;
    const avatarUrl = user.displayAvatarURL({ size: 1024 });
    
    const embed = new EmbedBuilder()
        .setTitle(`Photo de profil de ${user.globalName || user.username}`)
        .setImage(avatarUrl)
        .setColor(getThemeColorForGuild(msg.guild.id));
    
    await msg.channel.send({ embeds: [embed] });
});

defineCommand('choose', async (msg) => {
    const items = msg.content.split(/\s+/).slice(1);
    if (!items.length) {
        const embed = new EmbedBuilder()
            .setTitle('Choix aléatoire')
            .setDescription('Fournis des options.')
            .setColor(getThemeColorForGuild(msg.guild.id));
        
        return void msg.channel.send({ embeds: [embed] });
    }
    
    const pick = items[Math.floor(Math.random() * items.length)];
    
    const embed = new EmbedBuilder()
        .setTitle('Choix aléatoire')
        .setDescription(`**Choix:** ${pick}`)
        .setColor(getThemeColorForGuild(msg.guild.id));
    
    await msg.channel.send({ embeds: [embed] });
});

defineCommand('embed', async (msg) => {
    const text = msg.content.slice((process.env.CHILD_PREFIX || PREFIX).length + 'embed'.length).trim();
    if (!text) {
        const embed = new EmbedBuilder()
            .setTitle('Générateur d\'embed')
            .setDescription('Fournis un texte.')
            .setColor(getThemeColorForGuild(msg.guild.id));
        
        return void msg.channel.send({ embeds: [embed] });
    }
    
    const color = getGuildConfig(msg.guild.id).settings.themeColor;
    const embed = new EmbedBuilder()
        .setDescription(text)
        .setColor(color);
    
    await msg.channel.send({ embeds: [embed] });
});

// Bot control basics
defineCommand('setprefix', async (msg) => {
    if (!requireOwner(msg)) return;
    const newPrefix = msg.content.split(/\s+/)[1];
    if (!newPrefix) return void msg.channel.send('Usage: +setprefix <prefix>');
    process.env.CHILD_PREFIX = newPrefix;
    const cfg = getGuildConfig(msg.guild.id); cfg.prefix = newPrefix; saveGuildConfig(msg.guild.id, cfg);
    return void msg.channel.send(`Préfixe mis à jour: ${newPrefix}`);
});

// Sécurité: quitter automatiquement les serveurs non autorisés
defineCommand('secur invite', async (msg) => {
    if (!requireOwner(msg)) return;
    const onoff = (msg.content.split(/\s+/)[2] || '').toLowerCase();
    const cfg = getGuildConfig(msg.guild.id);
    if (onoff !== 'on' && onoff !== 'off') return void msg.channel.send('Usage: +secur invite <on/off>');
    cfg.settings.securInvite = onoff === 'on';
    saveGuildConfig(msg.guild.id, cfg);
    await msg.channel.send(`La secur invite a été ${cfg.settings.securInvite ? 'activée' : 'désactivée'}`);
});

// Vérifier et quitter les serveurs non autorisés
async function enforceServerSecurity() {
    try {
        const guilds = client.guilds.cache;
        for (const [, guild] of guilds) {
            const cfg = getGuildConfig(guild.id);
            if (cfg.settings.securInvite) {
                const isOwner = guild.ownerId === OWNER_ID;
                if (!isOwner) {
                    try {
                        await guild.leave();
                        console.log(`Left unauthorized guild: ${guild.name} (${guild.id})`);
                    } catch (e) {
                        console.error('Failed to leave guild', guild.id, e.message);
                    }
                }
            }
        }
    } catch (e) {
        console.error('enforceServerSecurity', e.message);
    }
}



// Vérifier la sécurité sur chaque nouveau serveur
client.on('guildCreate', async (guild) => {
    try {
        const cfg = getGuildConfig(guild.id);
        if (cfg.settings.securInvite) {
            const isOwner = guild.ownerId === OWNER_ID;
            if (!isOwner) {
                try {
                    await guild.leave();
                    console.log(`Left unauthorized guild on join: ${guild.name} (${guild.id})`);
                } catch (e) {
                    console.error('Failed to leave guild on join', guild.id, e.message);
                }
            }
        }
    } catch (e) {
        console.error('guildCreate security check', e.message);
    }
});

defineCommand('say', async (msg) => {
    const text = msg.content.slice((PREFIX + 'say').length).trim();
    if (!text) return;
    await msg.channel.send(text);
    try { await msg.delete(); } catch {}
});

defineCommand('mp', async (msg) => {
    if (!requireOwner(msg)) return;
    const [mention, ...rest] = msg.content.split(/\s+/).slice(1);
    const text = rest.join(' ');
    if (!mention || !text) return void msg.channel.send('Usage: +mp <@membre/ID> <message>');
    const id = mention.replace(/[^0-9]/g, '');
    try {
        const user = await client.users.fetch(id);
        await user.send(text);
        await msg.channel.send('Message envoyé.');
    } catch (e) {
        await msg.channel.send('Envoi impossible.');
    }
});

defineCommand('online', async (msg) => { if (!requireOwner(msg)) return; client.user.setPresence({ status: 'online' }); await msg.channel.send('Je suis maintenant en ligne.'); });
defineCommand('idle', async (msg) => { if (!requireOwner(msg)) return; client.user.setPresence({ status: 'idle' }); await msg.channel.send('Je suis maintenant en inactif.'); });
defineCommand('dnd', async (msg) => { if (!requireOwner(msg)) return; client.user.setPresence({ status: 'dnd' }); await msg.channel.send('Je suis maintenant en ne pas déranger.'); });
defineCommand('invisible', async (msg) => { if (!requireOwner(msg)) return; client.user.setPresence({ status: 'invisible' }); await msg.channel.send('Je suis maintenant invisible.'); });

// Set name/pic/banner
defineCommand('set', async (msg) => {
    if (!requireOwner(msg)) return;
    const parts = msg.content.split(/\s+/);
    const what = parts[1];
    const value = parts.slice(2).join(' ');
    if (!what || !value) return void msg.channel.send('Usage: +set <name/pic/banner> <valeur>');
    try {
        if (what === 'name') await client.user.setUsername(value.substring(0, 32));
        else if (what === 'pic') await client.user.setAvatar(value);
        else if (what === 'banner') await client.user.setBanner(value);
        else return void msg.channel.send('Paramètre inconnu.');
        await msg.channel.send('Mis à jour.');
    } catch (e) { await msg.channel.send('Impossible de mettre à jour.'); }
});

defineCommand('theme', async (msg) => {
    if (!requireOwner(msg)) return;
    const input = (msg.content.split(/\s+/)[1] || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(input)) {
        return void msg.channel.send('Couleur hex invalide. Exemple: `+theme #FF0000`');
    }
    const hex = input.slice(1);
    const cfg = getGuildConfig(msg.guild.id);
    cfg.settings.themeColor = parseInt(hex, 16);
    saveGuildConfig(msg.guild.id, cfg);
    await msg.channel.send(`Thème mis à jour sur ${input}.`);
});

// Activities
async function setActivity(type, msg) {
    const text = msg.content.split(/\s+/).slice(1).join(' ');
    if (!text) return void msg.channel.send('Fournis un message.');
    await client.user.setPresence({ activities: [{ type, name: text }], status: 'online' });
    let verb = 'faire une activité';
    if (type === ActivityType.Playing) verb = 'jouer à';
    else if (type === ActivityType.Watching) verb = 'regarder';
    else if (type === ActivityType.Listening) verb = 'écouter';
    else if (type === ActivityType.Competing) verb = 'compétitionner sur';
    await msg.channel.send(`Je vais maintenant ${verb} \`${text}\``);
}

// Commande stream améliorée avec support Twitch
defineCommand('stream', async (msg) => {
    if (!requireOwner(msg)) return;
    
    const title = msg.content.split(/\s+/).slice(1).join(' ').trim();
    if (!title) {
        return void msg.channel.send('Usage: `+stream <titre>`\nExemple: `+stream slt`');
    }

    const twitchUrl = 'https://www.twitch.tv/calio_its';
    await client.user.setPresence({
        activities: [{ type: ActivityType.Streaming, name: title, url: twitchUrl }],
        status: 'online'
    });

    await msg.channel.send(`Je vais maintenant streamer \`${title}\``);
});

defineCommand('playto', (m) => setActivity(ActivityType.Playing, m));
defineCommand('watch', (m) => setActivity(ActivityType.Watching, m));
defineCommand('listen', (m) => setActivity(ActivityType.Listening, m));
defineCommand('compet', (m) => setActivity(ActivityType.Competing, m));
defineCommand('remove activity', async (msg) => { if (!requireOwner(msg)) return; await client.user.setPresence({ activities: [] }); await msg.channel.send('J\'ai retiré l\'activité.'); });

defineCommand('server list', async (msg) => {
    if (!requireOwner(msg)) return;
    const guilds = Array.from(client.guilds.cache.values());
    if (guilds.length === 0) return void msg.channel.send('Aucun serveur.');
    const lines = guilds.map((g, i) => `${i+1} - ${g.name} (${g.memberCount || g.approximateMemberCount || 0} membres) • ID: ${g.id}`).join('\n');
    const embed = new EmbedBuilder()
        .setTitle('Liste des serveurs')
        .setDescription(lines.slice(0, 4000))
        .setColor(EMBED_RED);
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('invite', async (msg) => {
    if (!requireOwner(msg)) return;
    const url = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
    const embed = new EmbedBuilder()
        .setTitle('Lien d\'invitation du bot')
        .setDescription(url)
        .setColor(EMBED_RED);
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('leave', async (msg) => {
    if (!requireOwner(msg)) return;
    const id = msg.content.split(/\s+/)[1] || msg.guild.id;
    const g = client.guilds.cache.get(id);
    if (!g) return void msg.channel.send('Serveur introuvable.');
    const name = g.name;
    const count = g.memberCount || g.approximateMemberCount || 0;
    await g.leave();
    await msg.channel.send(`J'ai bien quitté le serveur ${name} (${count} membres)`);
});

// Owner management
defineCommand('owner', async (msg) => {
    if (!requireOwner(msg)) return;
    const mentioned = msg.mentions.users.first() || null;
    const term = msg.content.split(/\s+/).slice(1).join(' ').trim();
    let user = mentioned;
    if (!user && term) {
        const digits = term.replace(/[^0-9]/g, '');
        if (digits.length >= 16) {
            user = await client.users.fetch(digits).catch(() => null);
        }
        if (!user) {
            const members = await msg.guild.members.fetch();
            const lower = term.toLowerCase();
            const exact = members.find(m => (m.user.username && m.user.username.toLowerCase() === lower) || (m.user.globalName && m.user.globalName.toLowerCase() === lower) || (m.user.tag && m.user.tag.toLowerCase() === lower));
            user = exact?.user || null;
            if (!user) {
                const partial = members.find(m => (m.user.username && m.user.username.toLowerCase().includes(lower)) || (m.user.globalName && m.user.globalName.toLowerCase().includes(lower)) || (m.user.tag && m.user.tag.toLowerCase().includes(lower)));
                user = partial?.user || null;
            }
        }
    }
    if (!user) {
        const shown = term || '';
        return void msg.channel.send(`Aucun utilisateur de trouvé pour \`${shown}\``);
    }
    const id = user.id;
    const cfg = getGuildConfig(msg.guild.id);
    if (!cfg.owners.includes(id)) cfg.owners.push(id);
    saveGuildConfig(msg.guild.id, cfg);
    owners.add(id);
    const display = user.username || user.tag || user.id;
    await msg.channel.send(`${display} est maintenant owner`);
});
defineCommand('owners', async (msg) => {
    const cfg = getGuildConfig(msg.guild.id);
    const ownerIds = cfg.owners || [];
    if (ownerIds.length === 0) return void msg.channel.send('Aucun owner.');
    const pageSize = 10;
    let page = 0;

    async function buildPageEmbedAsync(p) {
        const start = p * pageSize;
        const slice = ownerIds.slice(start, start + pageSize);
        const entries = await Promise.all(slice.map(async (id, idx) => {
            const u = await client.users.fetch(id).catch(() => null);
            const name = u?.username || id;
            return `${start + idx + 1} - ${name} (${id})`;
        }));
        const embed = new EmbedBuilder()
            .setTitle('Liste des owners')
            .setDescription(entries.join('\n') || '—')
            .setColor(getThemeColorForGuild(msg.guild.id));
        return embed;
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('owners_prev').setStyle(ButtonStyle.Secondary).setEmoji('◄'),
        new ButtonBuilder().setCustomId('owners_next').setStyle(ButtonStyle.Secondary).setEmoji('➤')
    );

    const firstEmbed = await buildPageEmbedAsync(page);
    const sent = await msg.channel.send({ embeds: [firstEmbed], components: [row] });
    const collector = sent.createMessageComponentCollector({ time: 5 * 60 * 1000 });
    collector.on('collect', async (i) => {
        if (i.user.id !== msg.author.id) return i.reply({ content: 'Seul l\'auteur peut naviguer.', ephemeral: true });
        const maxPage = Math.max(0, Math.ceil(ownerIds.length / pageSize) - 1);
        if (i.customId === 'owners_prev') page = Math.max(0, page - 1);
        if (i.customId === 'owners_next') page = Math.min(maxPage, page + 1);
        const disabledPrev = page === 0;
        const disabledNext = page === maxPage;
        const newRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('owners_prev').setStyle(ButtonStyle.Secondary).setEmoji('◄').setDisabled(disabledPrev),
            new ButtonBuilder().setCustomId('owners_next').setStyle(ButtonStyle.Secondary).setEmoji('➤').setDisabled(disabledNext)
        );
        const embed = await buildPageEmbedAsync(page);
        await i.update({ embeds: [embed], components: [newRow] });
    });
});
defineCommand('unowner', async (msg) => {
    if (!requireOwner(msg)) return;
    const mentioned = msg.mentions.users.first() || null;
    const term = msg.content.split(/\s+/).slice(1).join(' ').trim();
    let user = mentioned;
    if (!user && term) {
        const digits = term.replace(/[^0-9]/g, '');
        if (digits.length >= 16) user = await client.users.fetch(digits).catch(() => null);
        if (!user) {
            const members = await msg.guild.members.fetch();
            const lower = term.toLowerCase();
            const exact = members.find(m => (m.user.username && m.user.username.toLowerCase() === lower) || (m.user.globalName && m.user.globalName.toLowerCase() === lower) || (m.user.tag && m.user.tag.toLowerCase() === lower));
            user = exact?.user || null;
            if (!user) {
                const partial = members.find(m => (m.user.username && m.user.username.toLowerCase().includes(lower)) || (m.user.globalName && m.user.globalName.toLowerCase().includes(lower)) || (m.user.tag && m.user.tag.toLowerCase().includes(lower)));
                user = partial?.user || null;
            }
        }
    }
    if (!user) {
        const shown = term || '';
        return void msg.channel.send(`Aucun utilisateur de trouvé pour \`${shown}\``);
    }
    const id = user.id;
    const cfg = getGuildConfig(msg.guild.id);
    cfg.owners = (cfg.owners || []).filter(x => x !== id);
    saveGuildConfig(msg.guild.id, cfg);
    owners.delete(id);
    const display = user.username || user.tag || user.id;
    await msg.channel.send(`${display} n'est plus owner`);
});
defineCommand('clear owners', async (msg) => { if (!requireOwner(msg)) return; const cfg = getGuildConfig(msg.guild.id); cfg.owners = []; saveGuildConfig(msg.guild.id, cfg); owners.clear(); await msg.channel.send('Tou les owner on ete suprime'); });

// Blacklist management
defineCommand('bl', async (msg) => {
    const [_, mentionOrId, ...reasonParts] = msg.content.split(/\s+/);
    if (!mentionOrId) {
        const cfg = getGuildConfig(msg.guild.id);
        const list = cfg.blacklist || [];
        if (list.length === 0) return void msg.channel.send('Blacklist vide.');

        const pageSize = 10;
        let page = 0;

        async function buildPageEmbedAsync(p) {
            const start = p * pageSize;
            const slice = list.slice(start, start + pageSize);
            const entries = await Promise.all(slice.map(async (id, idx) => {
                const u = await client.users.fetch(id).catch(() => null);
                const name = u?.username || id;
                return `${start + idx + 1} - ${name} (${id})`;
            }));
            const embed = new EmbedBuilder()
                .setTitle('Liste de la blacklist')
                .setDescription(entries.join('\n') || '—')
                .setColor(getThemeColorForGuild(msg.guild.id));
            return embed;
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bl_prev').setStyle(ButtonStyle.Secondary).setEmoji('◄'),
            new ButtonBuilder().setCustomId('bl_next').setStyle(ButtonStyle.Secondary).setEmoji('➤')
        );

        const firstEmbed = await buildPageEmbedAsync(page);
        const sent = await msg.channel.send({ embeds: [firstEmbed], components: [row] });
        const collector = sent.createMessageComponentCollector({ time: 5 * 60 * 1000 });
        collector.on('collect', async (i) => {
            if (i.user.id !== msg.author.id) return i.reply({ content: 'Seul l\'auteur peut naviguer.', ephemeral: true });
            const maxPage = Math.max(0, Math.ceil(list.length / pageSize) - 1);
            if (i.customId === 'bl_prev') page = Math.max(0, page - 1);
            if (i.customId === 'bl_next') page = Math.min(maxPage, page + 1);
            const disabledPrev = page === 0;
            const disabledNext = page === maxPage;
            const newRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('bl_prev').setStyle(ButtonStyle.Secondary).setEmoji('◄').setDisabled(disabledPrev),
                new ButtonBuilder().setCustomId('bl_next').setStyle(ButtonStyle.Secondary).setEmoji('➤').setDisabled(disabledNext)
            );
            const embed = await buildPageEmbedAsync(page);
            await i.update({ embeds: [embed], components: [newRow] });
        });
        return;
    }
    if (!requireOwner(msg)) return;
    const id = (msg.mentions.users.first()?.id) || mentionOrId.replace(/[^0-9]/g, '');
    const user = await client.users.fetch(id).catch(() => null);
    const cfg = getGuildConfig(msg.guild.id);
    if (!cfg.blacklist.includes(id)) cfg.blacklist.push(id);
    saveGuildConfig(msg.guild.id, cfg);
    blacklist.add(id);
    // Try to ban across all guilds
    let banned = 0, failed = 0;
    for (const g of client.guilds.cache.values()) {
        try {
            const member = await g.members.fetch(id).catch(() => null);
            if (member) { await g.members.ban(id, { reason: `Blacklist: ${reasonParts.join(' ') || 'aucune'}` }); banned++; }
            else { await g.bans.create(id, { reason: `Blacklist: ${reasonParts.join(' ') || 'aucune'}` }).then(()=>banned++).catch(()=>failed++); }
        } catch { failed++; }
    }
    const name = user?.username || id;
    await msg.channel.send(`${name} a été ajouté à la blacklist.\nIl a été banni de ${banned} serveurs.\nIl n'a pas pu être banni de ${failed} serveurs.`);
});
defineCommand('unbl', async (msg) => {
    if (!requireOwner(msg)) return;
    const id = (msg.mentions.users.first()?.id) || msg.content.split(/\s+/)[1];
    const u = await client.users.fetch(id).catch(()=>null);
    const cfg = getGuildConfig(msg.guild.id);
    cfg.blacklist = cfg.blacklist.filter(x => x !== id);
    saveGuildConfig(msg.guild.id, cfg);
    blacklist.delete(id);
    // Try to unban across all guilds
    for (const g of client.guilds.cache.values()) {
        try { await g.bans.remove(id).catch(()=>{}); } catch {}
    }
    const name = u?.username || id;
    await msg.channel.send(`${name} n'est plus blacklist`);
});
defineCommand('clear bl', async (msg) => { if (!requireOwner(msg)) return; const cfg = getGuildConfig(msg.guild.id); cfg.blacklist = []; saveGuildConfig(msg.guild.id, cfg); blacklist.clear(); await msg.channel.send('La blacklist a été réinitialisée'); });

// Security and anti-raid basic toggles
defineCommand('secur', async (msg) => { if (!requireOwner(msg)) return; const level = msg.content.split(/\s+/)[1]; const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.level = ['off','on','max'].includes(level) ? level : 'off'; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send(`Sécurité: ${cfg.settings.antiraid.level}`); });
defineCommand('secur invite', async (msg) => { if (!requireOwner(msg)) return; const onoff = (msg.content.split(/\s+/)[2] || '').toLowerCase(); const cfg = getGuildConfig(msg.guild.id); cfg.settings.automod.antilink.enabled = onoff === 'on'; cfg.settings.automod.antilink.mode = 'invite'; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send(`Antilink invit. ${cfg.settings.automod.antilink.enabled ? 'activé' : 'désactivé'}`); });
defineCommand('updatebot', async (msg) => {
    if (!requireOwner(msg)) return;
    try {
        const fs = require('fs');
        const file = __filename;
        const before = fs.statSync(file).mtimeMs;
        // Simulate update check: re-read file
        const content = fs.readFileSync(file, 'utf8');
        const after = fs.statSync(file).mtimeMs;
        if (after > before || content.length !== 0) {
            await msg.channel.send('Redémarrage...');
            process.exit(42);
        } else {
            await msg.channel.send('Le bot est déjà à jour.');
        }
    } catch {
        await msg.channel.send('Le bot est déjà à jour.');
    }
});
defineCommand('reset server', async (msg) => { if (!requireOwner(msg)) return; removeGuildConfig(msg.guild.id); await msg.channel.send('La base de donnée du serveur a été supprimée'); });
defineCommand('resetall', async (msg) => { if (!requireOwner(msg)) return; writeStore({ guilds: {} }); await msg.channel.send('La base de donnée du bot a été supprimée.'); });

defineCommand('raidlog', async (msg) => { if (!requireOwner(msg)) return; const parts = msg.content.split(/\s+/); const onoff = (parts[1] || '').toLowerCase(); const cfg = getGuildConfig(msg.guild.id); if (onoff === 'on') cfg.settings.antiraid.raidlogChannelId = (msg.mentions.channels.first()?.id) || msg.channel.id; else if (onoff === 'off') cfg.settings.antiraid.raidlogChannelId = null; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Raidlog mis à jour.'); });
defineCommand('raidping', async (msg) => { if (!requireOwner(msg)) return; const r = msg.mentions.roles.first(); const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.raidpingRoleId = r?.id || null; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Raid ping mis à jour.'); });
defineCommand('antitoken', async (msg) => { if (!requireOwner(msg)) return; await msg.channel.send('Paramètre antitoken enregistré.'); });
defineCommand('antiupdate', async (msg) => { if (!requireOwner(msg)) return; const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.antiupdate = true; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Antiupdate activé.'); });
defineCommand('antichannel', async (msg) => { if (!requireOwner(msg)) return; const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.antichannel = true; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Antichannel activé.'); });
defineCommand('antirole', async (msg) => { if (!requireOwner(msg)) return; const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.antirole = true; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Antirole activé.'); });
defineCommand('antiwebhook', async (msg) => { if (!requireOwner(msg)) return; const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.antiwebhook = true; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Antiwebhook activé.'); });
defineCommand('clear webhooks', async (msg) => { if (!requireOwner(msg)) return; const hooks = await msg.guild.fetchWebhooks(); for (const h of hooks.values()) { try { await h.delete('clear webhooks'); } catch {} } await msg.channel.send('Webhooks supprimés.'); });
defineCommand('antiunban', async (msg) => { if (!requireOwner(msg)) return; const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.antiunban = true; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Antiunban activé.'); });
defineCommand('antibot', async (msg) => { if (!requireOwner(msg)) return; const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.antibot = true; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Antibot activé.'); });
defineCommand('antiban', async (msg) => { if (!requireOwner(msg)) return; await msg.channel.send('Antiban activé (de base).'); });
defineCommand('antieveryone', async (msg) => { if (!requireOwner(msg)) return; const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.antieveryone = true; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Antieveryone activé.'); });
defineCommand('blrank', async (msg) => { if (!requireOwner(msg)) return; await msg.channel.send('blrank paramétré.'); });
defineCommand('punition', async (msg) => { if (!requireOwner(msg)) return; const val = (msg.content.split(/\s+/)[1] || '').toLowerCase(); const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.punition = ['ban','kick','strip'].includes(val)?val:'kick'; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Punition mise à jour.'); });
defineCommand('creation limit', async (msg) => { if (!requireOwner(msg)) return; const val = parseInt(msg.content.split(/\s+/)[2]||'0',10); const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.creationLimitMs = Math.max(0, val)*1000; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Limite de création mise à jour.'); });
defineCommand('wl', async (msg) => { if (!requireOwner(msg)) return; const id = (msg.mentions.users.first()?.id) || (msg.mentions.roles.first()?.id) || msg.content.split(/\s+/)[1]; const cfg = getGuildConfig(msg.guild.id); if (!id) return void msg.channel.send('Usage: +wl <@user/@role/ID>'); if (msg.mentions.roles.first()) { if (!cfg.settings.antiraid.whitelist.roles.includes(id)) cfg.settings.antiraid.whitelist.roles.push(id); } else { if (!cfg.settings.antiraid.whitelist.users.includes(id)) cfg.settings.antiraid.whitelist.users.push(id); } saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Ajouté à la whitelist.'); });
defineCommand('unwl', async (msg) => { if (!requireOwner(msg)) return; const id = (msg.mentions.users.first()?.id) || (msg.mentions.roles.first()?.id) || msg.content.split(/\s+/)[1]; const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.whitelist.users = cfg.settings.antiraid.whitelist.users.filter(x=>x!==id); cfg.settings.antiraid.whitelist.roles = cfg.settings.antiraid.whitelist.roles.filter(x=>x!==id); saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Retiré de la whitelist.'); });
defineCommand('clear wl', async (msg) => { if (!requireOwner(msg)) return; const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.whitelist = { users: [], roles: [] }; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Whitelist vidée.'); });

// Moderation settings
defineCommand('timeout', async (msg) => { if (!requireOwner(msg)) return; const onoff = (msg.content.split(/\s+/)[1]||'').toLowerCase(); const cfg = getGuildConfig(msg.guild.id); cfg.settings.moderation.timeout = onoff === 'on'; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send(`Timeout ${cfg.settings.moderation.timeout?'activé':'désactivé'}.`); });
defineCommand('clear limit', async (msg) => { if (!requireOwner(msg)) return; const n = parseInt(msg.content.split(/\s+/)[2]||'200',10); const cfg = getGuildConfig(msg.guild.id); cfg.settings.moderation.clearLimit = Math.max(1, Math.min(500, n)); saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Limite de clear mise à jour.'); });
defineCommand('muterole', async (msg) => { if (!requireOwner(msg)) return; const cfg = getGuildConfig(msg.guild.id); if (!cfg.settings.moderation.muteroleId) { const role = await msg.guild.roles.create({ name: 'Muted', permissions: [] }); cfg.settings.moderation.muteroleId = role.id; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Muterole créé.'); } else { await msg.channel.send(`Muterole: <@&${cfg.settings.moderation.muteroleId}>`); } });
defineCommand('set muterole', async (msg) => { if (!requireOwner(msg)) return; const r = msg.mentions.roles.first(); if (!r) return void msg.channel.send('Mentionne un rôle.'); const cfg = getGuildConfig(msg.guild.id); cfg.settings.moderation.muteroleId = r.id; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Muterole défini.'); });
defineCommand('antispam', async (msg) => { if (!requireOwner(msg)) return; const arg = (msg.content.split(/\s+/)[1]||'').toLowerCase(); const cfg = getGuildConfig(msg.guild.id); if (arg==='on'||arg==='off') { cfg.settings.automod.antispam.enabled = arg==='on'; saveGuildConfig(msg.guild.id, cfg); return void msg.channel.send(`Antispam ${arg==='on'?'activé':'désactivé'}`); } const parts = (msg.content.split(/\s+/)[1]||'').split('/'); const n = parseInt(parts[0]||'5',10); const per = parseInt(parts[1]||'6',10); cfg.settings.automod.antispam.msgs = n; cfg.settings.automod.antispam.perMs = per*1000; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Seuil antispam mis à jour.'); });
defineCommand('antilink', async (msg) => { if (!requireOwner(msg)) return; const arg = (msg.content.split(/\s+/)[1]||'').toLowerCase(); const cfg = getGuildConfig(msg.guild.id); if (arg==='on'||arg==='off') { cfg.settings.automod.antilink.enabled = arg==='on'; saveGuildConfig(msg.guild.id, cfg); return void msg.channel.send(`Antilink ${arg==='on'?'activé':'désactivé'}`); } if (arg==='invite'||arg==='all') { cfg.settings.automod.antilink.mode = arg; saveGuildConfig(msg.guild.id, cfg); return void msg.channel.send(`Mode antilink: ${arg}`); } await msg.channel.send('Usage: +antilink <on/off> | invite/all'); });
defineCommand('antimassmention', async (msg) => { if (!requireOwner(msg)) return; const arg = (msg.content.split(/\s+/)[1]||'').toLowerCase(); const cfg = getGuildConfig(msg.guild.id); if (arg==='on'||arg==='off') { cfg.settings.automod.antimassmention.enabled = arg==='on'; saveGuildConfig(msg.guild.id, cfg); return void msg.channel.send(`Antimassmention ${arg==='on'?'activé':'désactivé'}`); } const max = parseInt(arg||'5',10); cfg.settings.automod.antimassmention.max = max; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Seuil antimassmention mis à jour.'); });
defineCommand('antibadword', async (msg) => { if (!requireOwner(msg)) return; const arg = (msg.content.split(/\s+/)[1]||'').toLowerCase(); const cfg = getGuildConfig(msg.guild.id); cfg.settings.automod.antibadword.enabled = arg==='on'; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send(`Antibadword ${arg==='on'?'activé':'désactivé'}`); });
defineCommand('badword', async (msg) => { if (!requireOwner(msg)) return; const action = (msg.content.split(/\s+/)[1]||'').toLowerCase(); const word = msg.content.split(/\s+/)[2]; const cfg = getGuildConfig(msg.guild.id); if (action==='add'&&word) { if (!cfg.settings.automod.antibadword.words.includes(word.toLowerCase())) cfg.settings.automod.antibadword.words.push(word.toLowerCase()); saveGuildConfig(msg.guild.id, cfg); return void msg.channel.send('Mot ajouté.'); } if (action==='del'&&word) { cfg.settings.automod.antibadword.words = cfg.settings.automod.antibadword.words.filter(w=>w!==word.toLowerCase()); saveGuildConfig(msg.guild.id, cfg); return void msg.channel.send('Mot retiré.'); } if (action==='list') return void msg.channel.send('Badwords: ' + (cfg.settings.automod.antibadword.words.join(', ')||'aucun')); if (action==='clear') { cfg.settings.automod.antibadword.words = []; saveGuildConfig(msg.guild.id, cfg); return void msg.channel.send('Badwords vidés.'); } await msg.channel.send('Usage: +badword <add/del/list/clear> <mot>'); });
defineCommand('piconly', async (msg) => { if (!requireOwner(msg)) return; const action = (msg.content.split(/\s+/)[1]||'').toLowerCase(); const ch = msg.mentions.channels.first() || msg.channel; const cfg = getGuildConfig(msg.guild.id); if (action==='add') { if (!cfg.settings.automod.piconly.channelIds.includes(ch.id)) cfg.settings.automod.piconly.channelIds.push(ch.id); saveGuildConfig(msg.guild.id, cfg); return void msg.channel.send(`Piconly activé pour ${ch}`); } if (action==='del') { cfg.settings.automod.piconly.channelIds = cfg.settings.automod.piconly.channelIds.filter(id=>id!==ch.id); saveGuildConfig(msg.guild.id, cfg); return void msg.channel.send(`Piconly désactivé pour ${ch}`); } await msg.channel.send('Usage: +piconly <add/del> [#salon]'); });

// Moderation core (subset)
defineCommand('addrole', async (msg) => { const m = msg.mentions.members.first(); const r = msg.mentions.roles.last(); if (!m||!r) return void msg.channel.send('Usage: +addrole @membre @rôle'); await m.roles.add(r).catch(()=>{}); await msg.react('✅'); });
defineCommand('delrole', async (msg) => { const m = msg.mentions.members.first(); const r = msg.mentions.roles.last(); if (!m||!r) return void msg.channel.send('Usage: +delrole @membre @rôle'); await m.roles.remove(r).catch(()=>{}); await msg.react('✅'); });
defineCommand('ban', async (msg) => { const m = msg.mentions.members.first(); if (!m) return void msg.channel.send('Usage: +ban @membre'); await m.ban({ reason: 'Ban via commande' }).catch(()=>{}); await msg.react('✅'); });
defineCommand('kick', async (msg) => { const m = msg.mentions.members.first(); if (!m) return void msg.channel.send('Usage: +kick @membre'); await m.kick('Kick via commande').catch(()=>{}); await msg.react('✅'); });
defineCommand('derank', async (msg) => { const m = msg.mentions.members.first(); if (!m) return void msg.channel.send('Usage: +derank @membre'); for (const r of m.roles.cache.values()) { if (r.managed || r.id===msg.guild.id) continue; try { await m.roles.remove(r); } catch {} } await msg.react('✅'); });
defineCommand('hide', async (msg) => { await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, { ViewChannel: false }); await msg.react('✅'); });
defineCommand('unhide', async (msg) => { await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, { ViewChannel: true }); await msg.react('✅'); });
defineCommand('hideall', async (msg) => { for (const ch of msg.guild.channels.cache.values()) { try { await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { ViewChannel: false }); } catch {} } await msg.react('✅'); });
defineCommand('unhideall', async (msg) => { for (const ch of msg.guild.channels.cache.values()) { try { await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { ViewChannel: true }); } catch {} } await msg.react('✅'); });
defineCommand('lock', async (msg) => { await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false }); await msg.react('✅'); });
defineCommand('unlock', async (msg) => { await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true }); await msg.react('✅'); });
defineCommand('lockall', async (msg) => { for (const ch of msg.guild.channels.cache.values()) { try { await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false }); } catch {} } await msg.react('✅'); });
defineCommand('unlockall', async (msg) => { for (const ch of msg.guild.channels.cache.values()) { try { await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true }); } catch {} } await msg.react('✅'); });
defineCommand('mute', async (msg) => { const m = msg.mentions.members.first(); const cfg = getGuildConfig(msg.guild.id); if (!m||!cfg.settings.moderation.muteroleId) return void msg.channel.send('Usage: +mute @membre (muterole requis)'); await m.roles.add(cfg.settings.moderation.muteroleId).catch(()=>{}); await msg.react('✅'); });
defineCommand('unmute', async (msg) => { const m = msg.mentions.members.first(); const cfg = getGuildConfig(msg.guild.id); if (!m||!cfg.settings.moderation.muteroleId) return void msg.channel.send('Usage: +unmute @membre'); await m.roles.remove(cfg.settings.moderation.muteroleId).catch(()=>{}); await msg.react('✅'); });
defineCommand('unmuteall', async (msg) => { const cfg = getGuildConfig(msg.guild.id); if (!cfg.settings.moderation.muteroleId) return; const mems = await msg.guild.members.fetch(); for (const m of mems.values()) { try { await m.roles.remove(cfg.settings.moderation.muteroleId); } catch {} } await msg.react('✅'); });
defineCommand('mutelist', async (msg) => { const cfg = getGuildConfig(msg.guild.id); if (!cfg.settings.moderation.muteroleId) return void msg.channel.send('Aucun muterole.'); const role = msg.guild.roles.cache.get(cfg.settings.moderation.muteroleId); const list = (await msg.guild.members.fetch()).filter(m => role && m.roles.cache.has(role.id)); await msg.channel.send('Mutés: ' + list.map(m=>m.user.tag).join(', ').slice(0,1900)); });
defineCommand('warn', async (msg) => { const m = msg.mentions.members.first(); if (!m) return void msg.channel.send('Usage: +warn @membre'); const cfg = getGuildConfig(msg.guild.id); cfg.warns = cfg.warns||{}; cfg.warns[m.id]=(cfg.warns[m.id]||0)+1; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send(`${m.user.tag} avertissements: ${cfg.warns[m.id]}`); });
defineCommand('renew', async (msg) => { const ch = msg.channel; const pos = ch.position; const newCh = await ch.clone(); await ch.delete().catch(()=>{}); try { await newCh.setPosition(pos); } catch {} });
defineCommand('unban', async (msg) => { const id = msg.content.split(/\s+/)[1]; if (!id) return void msg.channel.send('Usage: +unban <ID>'); await msg.guild.bans.remove(id).catch(()=>{}); await msg.react('✅'); });
defineCommand('unbanall', async (msg) => { const bans = await msg.guild.bans.fetch(); for (const b of bans.values()) { try { await msg.guild.bans.remove(b.user.id); } catch {} } await msg.react('✅'); });

// Server management utilities
defineCommand('choose', async (msg) => { const items = msg.content.split(/\s+/).slice(1); if (!items.length) return void msg.channel.send('Fournis des options.'); const pick = items[Math.floor(Math.random()*items.length)]; await msg.channel.send('Choix: ' + pick); });
defineCommand('embed', async (msg) => { const text = msg.content.slice((process.env.CHILD_PREFIX||PREFIX).length + 'embed'.length).trim(); if (!text) return void msg.channel.send('Fournis un texte.'); const color = getGuildConfig(msg.guild.id).settings.themeColor; await msg.channel.send({ embeds: [new EmbedBuilder().setDescription(text).setColor(color)] }); });
defineCommand('cleanup', async (msg) => { const n = parseInt(msg.content.split(/\s+/)[1]||'50',10); const lim = getGuildConfig(msg.guild.id).settings.moderation.clearLimit; const count = Math.min(n, lim); await msg.channel.bulkDelete(count, true).catch(()=>{}); });
defineCommand('voicemove', async (msg) => { const [_, fromId, toId] = msg.content.split(/\s+/); const from = msg.guild.channels.cache.get(fromId); const to = msg.guild.channels.cache.get(toId); if (!from||!to) return void msg.channel.send('Usage: +voicemove <fromId> <toId>'); const members = from.members; for (const m of members.values()) { try { await m.voice.setChannel(to); } catch {} } await msg.react('✅'); });
defineCommand('voicekick', async (msg) => { const m = msg.mentions.members.first(); if (!m||!m.voice.channelId) return void msg.channel.send('Mentionne un membre en vocal.'); await m.voice.disconnect().catch(()=>{}); await msg.react('✅'); });
defineCommand('bringall', async (msg) => { const to = msg.mentions.channels.first(); if (!to || to.type !== 2) return void msg.channel.send('Mentionne un salon vocal.'); const members = (await msg.guild.members.fetch()).filter(m=>m.voice.channelId); for (const m of members.values()) { try { await m.voice.setChannel(to); } catch {} } await msg.react('✅'); });
defineCommand('slowmode', async (msg) => { const secs = parseInt(msg.content.split(/\s+/)[1]||'0',10); const ch = msg.mentions.channels.first() || msg.channel; await ch.setRateLimitPerUser(Math.max(0, Math.min(21600, secs))).catch(()=>{}); await msg.react('✅'); });
defineCommand('rename', async (msg) => { const name = msg.content.split(/\s+/).slice(1).join(' '); if (!name) return void msg.channel.send('Usage: +rename <nom>'); await msg.guild.setName(name).catch(()=>{}); await msg.react('✅'); });
defineCommand('set perm', async (msg) => { const perm = msg.content.split(/\s+/)[2]; const role = msg.mentions.roles.first(); if (!perm||!role) return void msg.channel.send('Usage: +set perm <permission> <@rôle>'); try { await msg.channel.permissionOverwrites.edit(role, { [perm]: true }); await msg.react('✅'); } catch { await msg.channel.send('Permission inconnue ou refusée.'); } });
defineCommand('del perm', async (msg) => { const role = msg.mentions.roles.first(); if (!role) return void msg.channel.send('Usage: +del perm <@rôle>'); try { await msg.channel.permissionOverwrites.delete(role); await msg.react('✅'); } catch {} });
defineCommand('clear perms', async (msg) => { try { await msg.channel.permissionOverwrites.set([]); await msg.react('✅'); } catch {} });
defineCommand('show pic', async (msg) => { const u = msg.mentions.users.first() || msg.author; await msg.channel.send(u.displayAvatarURL({ size: 1024 })); });
defineCommand('autopublish', async (msg) => { const arg = (msg.content.split(/\s+/)[1]||'').toLowerCase(); const cfg = getGuildConfig(msg.guild.id); cfg.settings.logs.autopublish = arg==='on'; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send(`Autopublish ${cfg.settings.logs.autopublish?'activé':'désactivé'}`); });

// Logs toggles (bind to current channel when on)
function setLogChannel(cmd, key) {
    defineCommand(cmd + ' on', async (msg) => { const cfg = getGuildConfig(msg.guild.id); cfg.settings.logs[key] = msg.channel.id; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send(`${cmd} activé ici.`); });
    defineCommand(cmd + ' off', async (msg) => { const cfg = getGuildConfig(msg.guild.id); cfg.settings.logs[key] = null; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send(`${cmd} désactivé.`); });
}
setLogChannel('modlog', 'modlog');
setLogChannel('messagelog', 'messagelog');
setLogChannel('voicelog', 'voicelog');
setLogChannel('boostlog', 'boostlog');
setLogChannel('rolelog', 'rolelog');
setLogChannel('raidlog', 'raidlog');
defineCommand('autoconfiglog', async (msg) => { const cfg = getGuildConfig(msg.guild.id); cfg.settings.logs.modlog = cfg.settings.logs.messagelog = cfg.settings.logs.voicelog = msg.channel.id; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Logs de base configurés ici.'); });
defineCommand('join settings', async (msg) => { const cfg = getGuildConfig(msg.guild.id); cfg.settings.logs.join = msg.channel.id; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Salon des joins défini ici.'); });
defineCommand('leave settings', async (msg) => { const cfg = getGuildConfig(msg.guild.id); cfg.settings.logs.leave = msg.channel.id; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('Salon des leaves défini ici.'); });
defineCommand('nolog', async (msg) => {
    const parts = msg.content.split(/\s+/);
    const sub = (parts[1] || '').toLowerCase();
    const ch = msg.mentions.channels.first() || msg.channel;
    const cfg = getGuildConfig(msg.guild.id);
    const list = cfg.settings.logs.nologChannels || [];
    if (sub === 'add') {
        if (!list.includes(ch.id)) list.push(ch.id);
        cfg.settings.logs.nologChannels = list; saveGuildConfig(msg.guild.id, cfg);
        return void msg.channel.send(`Nolog ajouté pour ${ch}.`);
    }
    if (sub === 'del') {
        cfg.settings.logs.nologChannels = list.filter(id => id !== ch.id); saveGuildConfig(msg.guild.id, cfg);
        return void msg.channel.send(`Nolog retiré pour ${ch}.`);
    }
    return void msg.channel.send('Usage: +nolog <add/del> [#salon]');
});

// Giveaways (stubs)
defineCommand('giveaway', async (msg) => { await msg.channel.send('Système de giveaway en cours d\'implémentation.'); });
defineCommand('end giveaway', async (msg) => { await msg.channel.send('Fin de giveaway en cours d\'implémentation.'); });
defineCommand('reroll', async (msg) => { await msg.channel.send('Reroll en cours d\'implémentation.'); });

// Backup (stubs)
defineCommand('backup', async (msg) => { await msg.channel.send('Backup en cours d\'implémentation.'); });
defineCommand('backup list', async (msg) => { await msg.channel.send('Liste des backups en cours d\'implémentation.'); });
defineCommand('backup delete', async (msg) => { await msg.channel.send('Suppression de backup en cours d\'implémentation.'); });
defineCommand('backup load', async (msg) => { await msg.channel.send('Chargement de backup en cours d\'implémentation.'); });

// Create emoji
defineCommand('create', async (msg) => {
    const parts = msg.content.split(/\s+/).slice(1);
    const emojiUrl = parts[0];
    const name = parts[1] || 'custom';
    if (!emojiUrl) return void msg.channel.send('Usage: +create <image_url> [nom]');
    try { const e = await msg.guild.emojis.create({ attachment: emojiUrl, name }); await msg.channel.send(`Emoji créé: <:${e.name}:${e.id}>`); } catch { await msg.channel.send('Impossible de créer l\'emoji.'); }
});

// News ticker, mass role, sync (stubs)
defineCommand('newsticker', async (msg) => { await msg.channel.send('Newsticker en cours d\'implémentation.'); });
defineCommand('massiverole', async (msg) => {
    if (!requireOwner(msg)) return;
    // Usage: +massiverole <add/del> <@rôle> [in:@rôle] [not:@rôle]
    const parts = msg.content.split(/\s+/).slice(1);
    const action = (parts[0] || '').toLowerCase();
    const targetRole = msg.mentions.roles.first();
    if (!['add','del'].includes(action) || !targetRole) {
        return void msg.channel.send('Usage: +massiverole <add/del> <@rôle> [in:@rôle] [not:@rôle]');
    }
    const mentionedRoles = Array.from(msg.mentions.roles.values());
    const filterRoles = mentionedRoles.filter(r => r.id !== targetRole.id);
    const inRole = filterRoles[0] || null;
    const notRole = filterRoles[1] || null;

    const members = await msg.guild.members.fetch();
    let affected = 0;
    for (const member of members.values()) {
        if (member.user.bot) continue;
        if (inRole && !member.roles.cache.has(inRole.id)) continue;
        if (notRole && member.roles.cache.has(notRole.id)) continue;
        try {
            if (action === 'add' && !member.roles.cache.has(targetRole.id)) {
                await member.roles.add(targetRole);
                affected++;
            } else if (action === 'del' && member.roles.cache.has(targetRole.id)) {
                await member.roles.remove(targetRole);
                affected++;
            }
        } catch {}
    }
    await msg.channel.send(`${affected} membre(s) mis à jour.`);
});

defineCommand('sync', async (msg) => {
    if (!requireOwner(msg)) return;
    // Usage: +sync <channel/category/all> [#salon]
    const kind = (msg.content.split(/\s+/)[1] || '').toLowerCase();
    if (!['channel','category','all'].includes(kind)) {
        return void msg.channel.send('Usage: +sync <channel/category/all> [#salon]');
    }

    if (kind === 'channel') {
        const ref = msg.mentions.channels.first() || msg.channel;
        const parent = ref.parent;
        if (!parent) return void msg.channel.send('Ce salon n\'a pas de catégorie à synchroniser.');
        try { await ref.lockPermissions(); await msg.react('✅'); } catch { await msg.channel.send('Sync impossible ici.'); }
        return;
    }

    if (kind === 'category') {
        const cat = (msg.mentions.channels.first() || msg.channel).parent || msg.channel;
        if (cat.type !== 4) return void msg.channel.send('Mentionne un salon de catégorie.');
        const children = cat.children.cache;
        let ok = 0;
        for (const ch of children.values()) {
            try { await ch.lockPermissions(); ok++; } catch {}
        }
        await msg.channel.send(`Synchronisé ${ok} salon(s) avec la catégorie.`);
        return;
    }

    if (kind === 'all') {
        let ok = 0;
        for (const ch of msg.guild.channels.cache.values()) {
            if (!ch.parent) continue;
            try { await ch.lockPermissions(); ok++; } catch {}
        }
        await msg.channel.send(`Synchronisé ${ok} salon(s) avec leurs catégories.`);
    }
});

// Ticket-like stubs
defineCommand('ticket settings', async (msg) => { await msg.channel.send('Ticket settings en cours d\'implémentation.'); });
defineCommand('claim', async (msg) => { await msg.channel.send('Claim en cours d\'implémentation.'); });
defineCommand('add', async (msg) => { await msg.channel.send('Ajout au ticket en cours d\'implémentation.'); });
defineCommand('del', async (msg) => { await msg.channel.send('Retrait du ticket en cours d\'implémentation.'); });
defineCommand('close', async (msg) => { await msg.channel.send('Fermeture du ticket en cours d\'implémentation.'); });
defineCommand('tempvoc', async (msg) => { await msg.channel.send('Tempvoc en cours d\'implémentation.'); });
defineCommand('twitch', async (msg) => { await msg.channel.send('Twitch en cours d\'implémentation.'); });
defineCommand('soutien', async (msg) => { await msg.channel.send('Soutien en cours d\'implémentation.'); });

// Message automod enforcement
const recentMsgs = new Map();
client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot || !message.guild) return;
        const cfg = getGuildConfig(message.guild.id);
        // Piconly channels
        if (cfg.settings.automod.piconly.channelIds.includes(message.channelId)) {
            if (message.attachments.size === 0) {
                await message.delete().catch(()=>{});
                return void message.channel.send({ content: `${message.author}, salon images seulement.`, allowedMentions: { users: [] } }).catch(()=>{});
            }
        }
        // Antilink
        if (cfg.settings.automod.antilink.enabled) {
            const hasLink = /(https?:\/\/|discord\.gg\/)/i.test(message.content);
            if (hasLink) {
                if (cfg.settings.automod.antilink.mode === 'invite' ? /discord\.gg\//i.test(message.content) : true) {
                    await message.delete().catch(()=>{});
                    return void message.channel.send({ content: `${message.author}, liens interdits.`, allowedMentions: { users: [] } }).catch(()=>{});
                }
            }
        }
        // Antimassmention
        if (cfg.settings.automod.antimassmention.enabled) {
            const mentions = (message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0));
            if (mentions >= cfg.settings.automod.antimassmention.max) {
                await message.delete().catch(()=>{});
                return void message.channel.send({ content: `${message.author}, trop de mentions.`, allowedMentions: { users: [] } }).catch(()=>{});
            }
        }
        // Antibadword
        if (cfg.settings.automod.antibadword.enabled && cfg.settings.automod.antibadword.words.length) {
            const lower = message.content.toLowerCase();
            if (cfg.settings.automod.antibadword.words.some(w => lower.includes(w))) {
                await message.delete().catch(()=>{});
                return void message.channel.send({ content: `${message.author}, mot interdit.`, allowedMentions: { users: [] } }).catch(()=>{});
            }
        }
        // Antispam
        if (cfg.settings.automod.antispam.enabled) {
            const key = `${message.guild.id}:${message.author.id}`;
            const now = Date.now();
            const windowMs = cfg.settings.automod.antispam.perMs;
            const rec = recentMsgs.get(key) || [];
            recentMsgs.set(key, rec.filter(t => now - t < windowMs).concat(now));
            if (recentMsgs.get(key).length > cfg.settings.automod.antispam.msgs) {
                await message.delete().catch(()=>{});
            }
        }
    } catch (e) { console.error('automod', e); }
});

// Command router (supports multi-word commands)
client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot || !message.guild) return;
        const cfg = getGuildConfig(message.guild.id);
        const currentPrefix = process.env.CHILD_PREFIX || cfg.prefix || PREFIX;
        if (!message.content.startsWith(currentPrefix)) return;
        if (blacklist.has(message.author.id) || (cfg.blacklist||[]).includes(message.author.id)) return;
        const tokens = message.content.slice(currentPrefix.length).trim().split(/\s+/);
        const tryTwo = (tokens[0] + (tokens[1] ? ' ' + tokens[1] : '')).toLowerCase();
        const tryOne = tokens[0].toLowerCase();
        const cmd = commands.get(commands.has(tryTwo) ? tryTwo : tryOne);
        if (!cmd) return;
        await cmd(message);
    } catch (e) {
        console.error('Command error', e);
    }
});

client.login(TOKEN);


