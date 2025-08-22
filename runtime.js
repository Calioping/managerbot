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
                antiraid: { level: 'off', raidlogChannelId: null, raidpingRoleId: null, antibot: false, antiwebhook: false, antirole: false, antichannel: false, antiupdate: false, antiunban: false, antieveryone: false, punition: 'kick', creationLimitMs: 0, whitelist: { users: [], roles: [] } },
                permLevels: { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '9': [] },
                permCommands: { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '9': [] }
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

// Normalize and backfill antiraid settings for compatibility with older data
function normalizeAntiraidSettings(settings) {
    try {
        const ar = settings.antiraid = settings.antiraid || {};
        if (typeof ar.punition !== 'string') ar.punition = 'derank';
        if (typeof ar.antibot !== 'boolean') ar.antibot = false;
        if (typeof ar.antiwebhook !== 'boolean') ar.antiwebhook = false;
        if (typeof ar.antirole !== 'boolean') ar.antirole = false;
        if (typeof ar.antichannel !== 'boolean') ar.antichannel = false;
        if (typeof ar.antiupdate !== 'boolean') ar.antiupdate = false;
        if (typeof ar.antiunban !== 'boolean') ar.antiunban = false;
        if (typeof ar.antiban !== 'boolean') ar.antiban = false;
        if (typeof ar.blrank !== 'boolean') ar.blrank = false;
        if (typeof ar.creationLimitMs !== 'number') ar.creationLimitMs = 0;

        // antieveryone may be boolean (legacy) or object
        if (typeof ar.antieveryone === 'boolean') {
            ar.antieveryone = { enabled: ar.antieveryone, max: 2, perMs: 2*60*60*1000 };
        } else if (typeof ar.antieveryone !== 'object' || ar.antieveryone === null) {
            ar.antieveryone = { enabled: false, max: 2, perMs: 2*60*60*1000 };
        } else {
            if (typeof ar.antieveryone.enabled !== 'boolean') ar.antieveryone.enabled = false;
            if (typeof ar.antieveryone.max !== 'number') ar.antieveryone.max = 2;
            if (typeof ar.antieveryone.perMs !== 'number') ar.antieveryone.perMs = 2*60*60*1000;
        }

        // antitoken object
        if (typeof ar.antitoken !== 'object' || ar.antitoken === null) ar.antitoken = { enabled: false, count: 7, perMs: 3000, lock: false };
        if (typeof ar.antitoken.enabled !== 'boolean') ar.antitoken.enabled = false;
        if (typeof ar.antitoken.count !== 'number') ar.antitoken.count = 7;
        if (typeof ar.antitoken.perMs !== 'number') ar.antitoken.perMs = 3000;
        if (typeof ar.antitoken.lock !== 'boolean') ar.antitoken.lock = false;

        // antideco object
        if (typeof ar.antideco !== 'object' || ar.antideco === null) ar.antideco = { enabled: false, max: 5, perMs: 60*1000 };
        if (typeof ar.antideco.enabled !== 'boolean') ar.antideco.enabled = false;
        if (typeof ar.antideco.max !== 'number') ar.antideco.max = 5;
        if (typeof ar.antideco.perMs !== 'number') ar.antideco.perMs = 60*1000;
    } catch {}
}

function ensureGuildConfigDefaults(gid) {
    const db = readStore();
    const g = db.guilds[gid];
    if (!g) return;
    if (!g.settings) g.settings = {};
    if (!g.settings.antiraid) g.settings.antiraid = {};
    normalizeAntiraidSettings(g.settings);
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
        { cmd: '+set perm <niveau> <rôle>', desc: 'Assigne un rôle au niveau de permission (1-9)' },
        { cmd: '+perms', desc: 'Affiche les rôles par niveaux (1,2,3,4,5,6,9)' },
        { cmd: '+perm addcmd <niveau> <commande>', desc: 'Autorise une commande pour un niveau' },
        { cmd: '+perm delcmd <niveau> <commande>', desc: 'Retire une commande autorisée pour un niveau' },
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
        embed.setFooter({ text: 'ζ͜͡Nexus Support' });
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
    embed.setFooter({ text: 'ζ͜͡Nexus Support' });
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
    const cfg = getGuildConfig(msg.guild.id);
    const currentPrefix = process.env.CHILD_PREFIX || cfg.prefix || PREFIX;

    // access control: only owners or users with any perm role
    const authorId = msg.author.id;
    const member = msg.member;
    const ownerOk = owners.has(authorId) || authorId === OWNER_ID || (cfg.owners||[]).includes(authorId);
    let roleOk = false;
    if (member && cfg.settings && cfg.settings.permLevels) {
        for (const lvl of Object.keys(cfg.settings.permLevels)) {
            for (const rid of (cfg.settings.permLevels[lvl]||[])) {
                if (member.roles.cache.has(rid)) { roleOk = true; break; }
            }
            if (roleOk) break;
        }
    }
    if (!ownerOk && !roleOk) { await msg.channel.send('Vous n\'avez pas accès a ce help'); return; }

    const basePages = [
        { title: 'Public', cmds: [
            'pic [membre]','banner [membre]','server pic','server banner','emoji <émoji>','support'
        ]},
        { title: 'Perm 1', cmds: [
            'warn <membre> [raison]','unmute <membre>'
        ]},
        { title: 'Perm 2', cmds: [
            'mute <membre> [raison]'
        ]},
        { title: 'Perm 3', cmds: [
            'lock [salon]','unlock [salon]','unbanall'
        ]},
        { title: 'Perm 4', cmds: [
            'mutelist','unmuteall'
        ]},
        { title: 'Perm 5', cmds: [
            'kick <membre> [raison]'
        ]},
        { title: 'Perm 6', cmds: [
            'addrole <membre> <rôle>','delrole <membre> <rôle>','derank <membre>'
        ]},
        { title: 'Perm 9 / Admin', cmds: [
            'cleanup <salon>','clear limit <nombre>','allbots','botadmins','alladmins','boosters','rolemembers <rôle>','serverinfo','vocinfo','role <rôle>','channel [salon]','user [membre]','member [membre]','unban <membre>','lockall','unlockall','hide [salon]','unhide [salon]','hideall [salon]','unhideall [salon]','voicemove [salon] [salon]','voicekick <membre>','bringall [salon]','slowmode <durée> [salon]','muterole','set muterole <rôle>','antispam <on/off>','antilink <on/off>','antimassmention <on/off>','badword <add/del> <mot>','badword list','clear badwords','piconly <add/del> [salon]','nolog <add/del> [salon]','join settings','leave settings','timeout <on/off>','modlog <on/off> [salon]','messagelog <on/off> [salon]','voicelog <on/off> [salon]','boostlog <on/off> [salon]','rolelog <on/off> [salon]','autopublish <on/off>','embed','create [émoji] [nom]','newsticker [nom]','massiverole [rôle] [rôle]','renew [salon]','rename <nom>'
        ]}
    ];

    const permTitleToLevel = { 'Perm 1': '1', 'Perm 2': '2', 'Perm 3': '3', 'Perm 4': '4', 'Perm 5': '5', 'Perm 6': '6', 'Perm 9 / Admin': '9' };
    const permCmds = (cfg.settings && cfg.settings.permCommands) ? cfg.settings.permCommands : { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '9': [] };

    const pages = basePages.map(p => {
        const lvl = permTitleToLevel[p.title];
        if (!lvl) return p;
        const dyn = Array.isArray(permCmds[lvl]) ? permCmds[lvl] : [];
        const merged = Array.from(new Set([...(p.cmds || []), ...dyn]));
        return { title: p.title, cmds: merged };
    });

    const note = 'Les paramètres peuvent être des noms, des mentions, ou des IDs.\nSi ce ne sont pas des mentions ils doivent être séparés par ,,';

    const buildPageEmbed = (idx) => {
        const p = pages[idx];
        const list = p.cmds.map(c => '`' + currentPrefix + c + '`').join('\n');
        return new EmbedBuilder()
            .setTitle(`Help (${p.title})`)
            .setDescription(list + '\n\n' + note)
            .setColor(0xFF0000)
            .setFooter({ text: `Page ${idx+1}/${pages.length} • ζ͜͡Nexus Support` });
    };

    let page = 0;
    const sent = await msg.channel.send({ embeds: [buildPageEmbed(page)], components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('helpall_prev').setLabel('◄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('helpall_next').setLabel('➤').setStyle(ButtonStyle.Secondary)
    )] });
    const collector = sent.createMessageComponentCollector({ time: 10 * 60 * 1000 });
    collector.on('collect', async (i) => {
        if (i.user.id !== msg.author.id) return i.reply({ content: 'Seul l\'auteur peut naviguer ici.', ephemeral: true });
        if (i.customId === 'helpall_prev') { page = (page - 1 + pages.length) % pages.length; await i.update({ embeds: [buildPageEmbed(page)] }); }
        if (i.customId === 'helpall_next') { page = (page + 1) % pages.length; await i.update({ embeds: [buildPageEmbed(page)] }); }
    });
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
// Server media commands
defineCommand('server pic', async (msg) => {
    const url = msg.guild.iconURL({ size: 1024 });
    if (!url) return void msg.channel.send('Aucune icône pour ce serveur.');
    const embed = new EmbedBuilder().setTitle(`Icône de ${msg.guild.name}`).setImage(url).setColor(getThemeColorForGuild(msg.guild.id));
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('server banner', async (msg) => {
    const url = msg.guild.bannerURL({ size: 1024 });
    if (!url) return void msg.channel.send('Aucune bannière pour ce serveur.');
    const embed = new EmbedBuilder().setTitle(`Bannière de ${msg.guild.name}`).setImage(url).setColor(getThemeColorForGuild(msg.guild.id));
    await msg.channel.send({ embeds: [embed] });
});
defineCommand('support', async (msg) => {
    await msg.channel.send('Support: https://discord.gg/dN8pU5hXcC');
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
    if (!requireOwner(msg)) return;
    let state = {
        title: '', description: 'Configurer l\'embed via le menu ci-dessous.', author: '', footer: '', thumbnail: '', timestamp: false, image: '', url: '', color: getThemeColorForGuild(msg.guild.id)
    };

    function buildPreview() {
        const e = new EmbedBuilder().setColor(state.color || 0xFF0000);
        if (state.title) e.setTitle(state.title);
        e.setDescription(state.description && state.description.length ? state.description : '\u200B');
        if (state.author) e.setAuthor({ name: state.author });
        if (state.footer) e.setFooter({ text: state.footer });
        if (state.thumbnail) e.setThumbnail(state.thumbnail);
        if (state.image) e.setImage(state.image);
        if (state.url) e.setURL(state.url);
        if (state.timestamp) e.setTimestamp(new Date());
        return e;
    }

    function buildMenu(customId) {
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(customId)
                .setPlaceholder('Modifier l\'embed')
                .addOptions(
                    { label: 'Modifier le titre', value: 'title' },
                    { label: 'Modifier la description', value: 'description' },
                    { label: 'Modifier l\'auteur', value: 'author' },
                    { label: 'Modifier le footer', value: 'footer' },
                    { label: 'Modifier le thumbnail', value: 'thumbnail' },
                    { label: 'Modifier le timestamp', value: 'timestamp' },
                    { label: 'Modifier l\'image', value: 'image' },
                    { label: 'Modifier l\'url', value: 'url' },
                    { label: 'Modifier la couleur', value: 'color' }
                )
        );
    }

    function buildSendRow() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('embed_send').setLabel('Envoyer l\'embed').setStyle(ButtonStyle.Success)
        );
    }

    const menuId = `embed_menu:${msg.id}:${Date.now()}`;
    const sent = await msg.channel.send({ embeds: [buildPreview()], components: [buildMenu(menuId), buildSendRow()] });

    const componentCollector = sent.createMessageComponentCollector({ time: 10 * 60 * 1000 });

    const ask = async (question) => {
        const q = await msg.channel.send(question);
        const filter = (m) => m.author.id === msg.author.id && m.channelId === msg.channelId;
        const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 60_000 });
        const answer = collected.first();
        if (!answer) { try { await q.delete().catch(()=>{}); } catch {} return null; }
        const value = answer.content.trim();
        try { await answer.delete().catch(()=>{}); } catch {}
        try { await q.delete().catch(()=>{}); } catch {}
        return value;
    };

    componentCollector.on('collect', async (i) => {
        if (i.user.id !== msg.author.id) return i.reply({ content: 'Seul l\'auteur peut modifier cet embed.', ephemeral: true });
        if (i.customId === 'embed_send') {
            await i.deferUpdate();
            const target = await ask('Dans quel channel voulez-vous envoyer l\'embed? (mention/ID)');
            if (!target) return;
            const id = target.replace(/[^0-9]/g, '');
            const ch = msg.guild.channels.cache.get(id) || msg.mentions.channels.first();
            if (!ch) return;
            await ch.send({ embeds: [buildPreview()] });
            await msg.channel.send(`L'embed a été envoyé dans le salon ${ch}`);
            return;
        }
        if (i.customId !== menuId) return;
        const choice = i.values[0];
        await i.deferUpdate();
        if (choice === 'title') {
            const v = await ask('Nouveau titre :'); if (v===null) return; state.title = v.slice(0, 256);
        } else if (choice === 'description') {
            const v = await ask('Nouvelle description :'); if (v===null) return; state.description = v.slice(0, 4000);
        } else if (choice === 'author') {
            const v = await ask('Auteur :'); if (v===null) return; state.author = v.slice(0, 256);
        } else if (choice === 'footer') {
            const v = await ask('Footer :'); if (v===null) return; state.footer = v.slice(0, 2048);
        } else if (choice === 'thumbnail') {
            const v = await ask('URL du thumbnail :'); if (v===null) return; state.thumbnail = v;
        } else if (choice === 'timestamp') {
            const v = await ask('Activer le timestamp ? (oui/non)'); if (v===null) return; state.timestamp = /^oui$/i.test(v);
        } else if (choice === 'image') {
            const v = await ask('URL de l\'image :'); if (v===null) return; state.image = v;
        } else if (choice === 'url') {
            const v = await ask('URL à associer au titre :'); if (v===null) return; state.url = v;
        } else if (choice === 'color') {
            const v = await ask('Couleur hex (ex: #FF0000) :'); if (v===null) return; if (/^#[0-9a-fA-F]{6}$/.test(v)) state.color = parseInt(v.slice(1),16);
        }
        try { await sent.edit({ embeds: [buildPreview()] }); } catch {}
    });
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
            .setDescription(entries.join('\\n') || '—')
            .setColor(getThemeColorForGuild(msg.guild.id))
            .setFooter({ text: 'ζ͜͡Nexus Support' });
        return embed;
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('owners_prev').setStyle(ButtonStyle.Secondary).setLabel('<'),
        new ButtonBuilder().setCustomId('owners_next').setStyle(ButtonStyle.Secondary).setLabel('>')
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
            new ButtonBuilder().setCustomId('owners_prev').setStyle(ButtonStyle.Secondary).setLabel('<').setDisabled(disabledPrev),
            new ButtonBuilder().setCustomId('owners_next').setStyle(ButtonStyle.Secondary).setLabel('>').setDisabled(disabledNext)
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
            embed.setFooter({ text: 'ζ͜͡Nexus Support' });
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
defineCommand('secur', async (msg) => {
    if (!requireOwner(msg)) return;
    const cfg = getGuildConfig(msg.guild.id);
    ensureGuildConfigDefaults(msg.guild.id);
    const ar = getGuildConfig(msg.guild.id).settings.antiraid;

    const arg = (msg.content.split(/\s+/)[1] || '').toLowerCase();

    // Apply presets when specified
    if (['off','on','max'].includes(arg)) {
        if (arg === 'off') {
            ar.antiban = false; ar.antibot = false; ar.antichannel = false; ar.antirole = false; ar.antiupdate = false; ar.antiwebhook = false; ar.antiunban = false; ar.blrank = false;
            ar.antieveryone = { enabled: false, max: 2, perMs: 2*60*60*1000 };
            ar.antitoken = { enabled: false, count: 7, perMs: 3000, lock: false };
            ar.antideco = { enabled: false, max: 5, perMs: 60*1000 };
            ar.creationLimitMs = 0;
            ar.punition = 'derank';
        } else if (arg === 'on') {
            ar.antiban = true; ar.antibot = true; ar.antichannel = true; ar.antirole = true; ar.antiupdate = true; ar.antiwebhook = true; ar.antiunban = true; ar.blrank = true;
            ar.antieveryone = { enabled: true, max: 2, perMs: 2*60*60*1000 };
            ar.antitoken = { enabled: true, count: 7, perMs: 3000, lock: false };
            ar.antideco = { enabled: false, max: 5, perMs: 60*1000 };
            ar.creationLimitMs = 7*24*60*60*1000; // 7d
            ar.punition = 'derank';
        } else if (arg === 'max') {
            ar.antiban = true; ar.antibot = true; ar.antichannel = true; ar.antirole = true; ar.antiupdate = true; ar.antiwebhook = true; ar.antiunban = true; ar.blrank = true;
            ar.antieveryone = { enabled: true, max: 1, perMs: 2*60*60*1000 };
            ar.antitoken = { enabled: true, count: 4, perMs: 3000, lock: true };
            ar.antideco = { enabled: true, max: 5, perMs: 60*1000 };
            ar.creationLimitMs = 30*24*60*60*1000; // 30d
            ar.punition = 'derank';
        }
        cfg.settings.antiraid = ar;
        saveGuildConfig(msg.guild.id, cfg);
    }

    // Helper to format ms to shorthand like 3s, 1m, 2h, 7d
    const fmt = (ms) => {
        if (!ms) return '0s';
        const sec = Math.round(ms/1000);
        if (sec % 86400 === 0) return `${sec/86400}d`;
        if (sec % 3600 === 0) return `${sec/3600}h`;
        if (sec % 60 === 0) return `${sec/60}m`;
        return `${sec}s`;
    };

    const creationLimit = ar.creationLimitMs ? fmt(ar.creationLimitMs) : '0s';
    const antidecoText = `${ar.antideco?.enabled ? 'on' : 'off'} ${ar.antideco?.max ?? 5} / ${fmt(ar.antideco?.perMs ?? 60000)} - derank`;
    const antieveryoneText = `${ar.antieveryone?.enabled ? 'on' : 'off'} ${ar.antieveryone?.max ?? 2} / ${fmt(ar.antieveryone?.perMs ?? 2*60*60*1000)} - derank`;
    const antitokenText = `${ar.antitoken?.enabled ? 'on' : 'off'} ${ar.antitoken?.count ?? 7} / ${fmt(ar.antitoken?.perMs ?? 3000)} - derank`;

    const getOnOff = (v) => v ? 'on' : 'off';

    const raidlogName = ar.raidlogChannelId ? (msg.guild.channels.cache.get(ar.raidlogChannelId)?.toString() || 'None') : 'None';
    const raidpingName = ar.raidpingRoleId ? (`<@&${ar.raidpingRoleId}>`) : '@everyone';

    const lines = [
        'Securisation du serveur',
        `Antiban: ${getOnOff(ar.antiban)} - derank`,
        `Antibot: ${getOnOff(ar.antibot)} - derank`,
        `Antichannel: ${getOnOff(ar.antichannel)} - derank`,
        `Antideco: ${antidecoText}`,
        `Antieveryone: ${antieveryoneText}`,
        `Antirole: ${getOnOff(ar.antirole)} - derank`,
        `Antitoken: ${antitokenText}`,
        `Antiunban: ${getOnOff(ar.antiunban)} - derank`,
        `Antiupdate: ${getOnOff(ar.antiupdate)} - derank`,
        `Antiwebhook: ${getOnOff(ar.antiwebhook)} - derank`,
        `Blrank: ${getOnOff(ar.blrank)} - derank`,
        `Creation limit: ${creationLimit}`,
        `Logs de raid: ${raidlogName}`,
        `Raidping: ${raidpingName}`
    ];

    const embed = new EmbedBuilder()
        .setTitle('Sécurisation du serveur')
        .setDescription(lines.slice(1).join('\n'))
        .setColor(getThemeColorForGuild(msg.guild.id));

    await msg.channel.send({ embeds: [embed] });
});
defineCommand('secur invite', async (msg) => { if (!requireOwner(msg)) return; const onoff = (msg.content.split(/\s+/)[2] || '').toLowerCase(); const cfg = getGuildConfig(msg.guild.id); cfg.settings.automod.antilink.enabled = onoff === 'on'; cfg.settings.automod.antilink.mode = 'invite'; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send(`Antilink invit. ${cfg.settings.automod.antilink.enabled ? 'activé' : 'désactivé'}`); });
defineCommand('updatebot', async (msg) => { if (!requireOwner(msg)) return; await msg.channel.send('Le bot est déjà à jour.'); });
defineCommand('update', async (msg) => { if (!requireOwner(msg)) return; await msg.channel.send('Le bot est déjà à jour.'); });
defineCommand('reset server', async (msg) => { if (!requireOwner(msg)) return; await msg.channel.send('La base de donnée du serveur a été supprimée'); removeGuildConfig(msg.guild.id); });
defineCommand('resetall', async (msg) => { if (!requireOwner(msg)) return; await msg.channel.send('La base de donnée du bot a été supprimée.'); writeStore({ guilds: {} }); });

defineCommand('raidlog', async (msg) => {
    if (!requireOwner(msg)) return;
    const parts = msg.content.split(/\s+/);
    const onoff = (parts[1] || '').toLowerCase();
    const cfg = getGuildConfig(msg.guild.id);
    if (onoff === 'on') {
        const ch = msg.mentions.channels.first() || msg.channel;
        cfg.settings.antiraid.raidlogChannelId = ch.id;
        saveGuildConfig(msg.guild.id, cfg);
        return void msg.channel.send("Les logs d'antiraid ont été activés");
    }
    if (onoff === 'off') {
        cfg.settings.antiraid.raidlogChannelId = null;
        saveGuildConfig(msg.guild.id, cfg);
        return void msg.channel.send("Les logs d'antiraid ont été désactivés");
    }
    return void msg.channel.send('Usage: +raidlog <on/off> [#salon]');
});
defineCommand('raid log', async (msg) => { const fn = commands.get('raidlog'); if (fn) return fn(msg); });
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
defineCommand('wl', async (msg) => {
    if (!requireOwner(msg)) return;
    const parts = msg.content.split(/\s+/).slice(1);
    const cfg = getGuildConfig(msg.guild.id);

    // Liste si aucun argument
    if (parts.length === 0 || (!msg.mentions.users.size && !msg.mentions.roles.size && !parts[0])) {
        const userMentions = (cfg.settings.antiraid.whitelist.users || []).map(id => `<@${id}>`);
        const roleMentions = (cfg.settings.antiraid.whitelist.roles || []).map(id => `<@&${id}>`);
        const embed = new EmbedBuilder()
            .setTitle('Whitelist')
            .addFields(
                { name: 'Membres', value: userMentions.length ? userMentions.join('\n') : 'Aucun', inline: false },
                { name: 'Rôles', value: roleMentions.length ? roleMentions.join('\n') : 'Aucun', inline: false }
            )
            .setColor(0xFF0000);
        return void msg.channel.send({ embeds: [embed] });
    }

    // Ajout si argument
    const id = (msg.mentions.users.first()?.id) || (msg.mentions.roles.first()?.id) || parts[0];
    if (!id) return void msg.channel.send('Usage: +wl <@user/@role/ID>');
    if (msg.mentions.roles.first()) {
        if (!cfg.settings.antiraid.whitelist.roles.includes(id)) cfg.settings.antiraid.whitelist.roles.push(id);
    } else {
        if (!cfg.settings.antiraid.whitelist.users.includes(id)) cfg.settings.antiraid.whitelist.users.push(id);
    }
    saveGuildConfig(msg.guild.id, cfg);

    // Libellé: username pour user, nom pour rôle, sinon tentative fetch par ID
    const userMention = msg.mentions.users.first();
    const roleMention = msg.mentions.roles.first();
    let label = '';
    if (userMention) label = userMention.username;
    else if (roleMention) label = roleMention.name;
    else {
        const fetchedUser = await client.users.fetch(id).catch(() => null);
        if (fetchedUser) label = fetchedUser.username; else {
            const roleById = msg.guild.roles.cache.get(id);
            label = roleById ? roleById.name : id;
        }
    }
    await msg.channel.send(`${label} est maintenant wl`);
});
defineCommand('unwl', async (msg) => {
    if (!requireOwner(msg)) return;
    const id = (msg.mentions.users.first()?.id) || (msg.mentions.roles.first()?.id) || msg.content.split(/\s+/)[1];
    const cfg = getGuildConfig(msg.guild.id);
    cfg.settings.antiraid.whitelist.users = cfg.settings.antiraid.whitelist.users.filter(x=>x!==id);
    cfg.settings.antiraid.whitelist.roles = cfg.settings.antiraid.whitelist.roles.filter(x=>x!==id);
    saveGuildConfig(msg.guild.id, cfg);

    const userMention = msg.mentions.users.first();
    const roleMention = msg.mentions.roles.first();
    let label = '';
    if (userMention) label = userMention.username;
    else if (roleMention) label = roleMention.name;
    else {
        const fetchedUser = await client.users.fetch(id).catch(() => null);
        if (fetchedUser) label = fetchedUser.username; else {
            const roleById = msg.guild.roles.cache.get(id);
            label = roleById ? roleById.name : id;
        }
    }
    await msg.channel.send(`${label} n'est plus wl`);
});
defineCommand('clear wl', async (msg) => { if (!requireOwner(msg)) return; const cfg = getGuildConfig(msg.guild.id); cfg.settings.antiraid.whitelist = { users: [], roles: [] }; saveGuildConfig(msg.guild.id, cfg); await msg.channel.send('La whitelist a bien été réinitialisée'); });

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
defineCommand('lock', async (msg) => {
	if (!msg.guild) return;
	const parts = msg.content.split(/\s+/);
	const target = msg.mentions.channels.first() || (parts[1] && msg.guild.channels.cache.get(parts[1])) || msg.channel;
	try {
		await target.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false });
		await msg.channel.send(`Le salon (${target}) a été lock`);
	} catch {
		await msg.channel.send('Impossible de lock ce salon.');
	}
});
defineCommand('unlock', async (msg) => {
	if (!msg.guild) return;
	const parts = msg.content.split(/\s+/);
	const target = msg.mentions.channels.first() || (parts[1] && msg.guild.channels.cache.get(parts[1])) || msg.channel;
	try {
		await target.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true });
		await msg.channel.send(`Le salon (${target}) a été unlock`);
	} catch {
		await msg.channel.send('Impossible de unlock ce salon.');
	}
});
defineCommand('lockall', async (msg) => { for (const ch of msg.guild.channels.cache.values()) { try { await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false }); } catch {} } await msg.react('✅'); });
defineCommand('unlockall', async (msg) => { for (const ch of msg.guild.channels.cache.values()) { try { await ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true }); } catch {} } await msg.react('✅'); });
defineCommand('mute', async (msg) => {
	if (!msg.guild) return;
	const cfg = getGuildConfig(msg.guild.id);
	const m = msg.mentions.members.first();
	const args = msg.content.split(/\s+/).slice(2);
	const reason = args.join(' ').trim() || 'Aucune';
	if (!m || !cfg.settings.moderation.muteroleId) return void msg.channel.send('Usage: +mute @membre [raison] (muterole requis)');
	await m.roles.add(cfg.settings.moderation.muteroleId).catch(()=>{});
	await msg.channel.send(`${m} a été mute pour \`${reason}\``);
});
defineCommand('unmute', async (msg) => { const m = msg.mentions.members.first(); const cfg = getGuildConfig(msg.guild.id); if (!m||!cfg.settings.moderation.muteroleId) return void msg.channel.send('Usage: +unmute @membre'); await m.roles.remove(cfg.settings.moderation.muteroleId).catch(()=>{}); await msg.react('✅'); });
defineCommand('unmuteall', async (msg) => {
	const cfg = getGuildConfig(msg.guild.id);
	if (!cfg.settings.moderation.muteroleId) return;
	const roleId = cfg.settings.moderation.muteroleId;
	const mems = await msg.guild.members.fetch();
	const toUnmute = mems.filter(m => m.roles.cache.has(roleId));
	await msg.channel.send(`Je vais unmute ${toUnmute.size} membres`);
	let success = 0, total = toUnmute.size;
	for (const m of toUnmute.values()) {
		try { await m.roles.remove(roleId); success++; } catch {}
	}
	await msg.channel.send(`J'ai unmute ${success}/${total} membres`);
});
defineCommand('mutelist', async (msg) => { const cfg = getGuildConfig(msg.guild.id); if (!cfg.settings.moderation.muteroleId) return void msg.channel.send('Aucun muterole.'); const role = msg.guild.roles.cache.get(cfg.settings.moderation.muteroleId); const list = (await msg.guild.members.fetch()).filter(m => role && m.roles.cache.has(role.id)); await msg.channel.send('Mutés: ' + list.map(m=>m.user.tag).join(', ').slice(0,1900)); });
defineCommand('warn', async (msg) => {
    const m = msg.mentions.members.first();
    if (!m) return void msg.channel.send('Usage: +warn @membre [raison]');
    const reason = msg.content.split(/\s+/).slice(2).join(' ').trim() || 'Aucune raison';
    const cfg = getGuildConfig(msg.guild.id);
    cfg.warns = cfg.warns || {};
    cfg.warns[m.id] = (cfg.warns[m.id] || 0) + 1;
    saveGuildConfig(msg.guild.id, cfg);
    const username = m.user.username || m.user.id;
    await msg.channel.send(`[${username}] a été averti pour ${reason}`);
});
defineCommand('renew', async (msg) => { const ch = msg.channel; const pos = ch.position; const newCh = await ch.clone(); await ch.delete().catch(()=>{}); try { await newCh.setPosition(pos); } catch {} });
defineCommand('unban', async (msg) => { const id = msg.content.split(/\s+/)[1]; if (!id) return void msg.channel.send('Usage: +unban <ID>'); await msg.guild.bans.remove(id).catch(()=>{}); await msg.react('✅'); });
defineCommand('unbanall', async (msg) => { const bans = await msg.guild.bans.fetch(); for (const b of bans.values()) { try { await msg.guild.bans.remove(b.user.id); } catch {} } await msg.channel.send('Tous les membres bannis ont été débannis.'); });

// Server management utilities
defineCommand('choose', async (msg) => { const items = msg.content.split(/\s+/).slice(1); if (!items.length) return void msg.channel.send('Fournis des options.'); const pick = items[Math.floor(Math.random()*items.length)]; await msg.channel.send('Choix: ' + pick); });
// (Remplacé par le générateur interactif ci-dessus)
defineCommand('cleanup', async (msg) => { const n = parseInt(msg.content.split(/\s+/)[1]||'50',10); const lim = getGuildConfig(msg.guild.id).settings.moderation.clearLimit; const count = Math.min(n, lim); await msg.channel.bulkDelete(count, true).catch(()=>{}); });
defineCommand('voicemove', async (msg) => { const [_, fromId, toId] = msg.content.split(/\s+/); const from = msg.guild.channels.cache.get(fromId); const to = msg.guild.channels.cache.get(toId); if (!from||!to) return void msg.channel.send('Usage: +voicemove <fromId> <toId>'); const members = from.members; for (const m of members.values()) { try { await m.voice.setChannel(to); } catch {} } await msg.channel.send(`Tous les utilisateurs du ${from} ont été déplacés vers ${to}`); });
defineCommand('voicekick', async (msg) => { let m = msg.mentions.members.first(); const idArg = msg.content.split(/\s+/)[1]; if (!m && idArg) { const uid = idArg.replace(/[^0-9]/g, ''); if (uid) m = await msg.guild.members.fetch(uid).catch(()=>null); } if (!m||!m.voice.channelId) return void msg.channel.send('Veuillez mentionner un utilisateur.'); const chId = m.voice.channelId; await m.voice.disconnect().catch(()=>{}); const ch = chId ? msg.guild.channels.cache.get(chId) : null; await msg.channel.send(`${m.user.username} a été déconnecté de la vocal ${ch ? ch.toString() : ''}`); });
defineCommand('bringall', async (msg) => { let to = msg.mentions.channels.first(); if (!to) { const idArg = msg.content.split(/\s+/)[1]; const chId = idArg ? idArg.replace(/[^0-9]/g, '') : ''; if (chId) to = msg.guild.channels.cache.get(chId) || null; } if (!to || to.type !== 2) return void msg.channel.send('Mentionne un salon vocal ou fournis un ID.'); const members = (await msg.guild.members.fetch()).filter(m=>m.voice.channelId); for (const m of members.values()) { try { await m.voice.setChannel(to); } catch {} } await msg.channel.send(`Tous les utilisateurs ont bien été déplacés vers ${to}`); });
defineCommand('slowmode', async (msg) => { const parts = msg.content.split(/\s+/).slice(1); const dur = (parts[0] || '').trim(); const m = dur.match(/^(\d+)([hms])$/i); if (!m) return void msg.channel.send('Usage: +slowmode <durée><s/m/h> [#salon]'); const n = parseInt(m[1], 10); const unit = m[2].toLowerCase(); let secs = n; if (unit === 'm') secs = n * 60; else if (unit === 'h') secs = n * 3600; secs = Math.max(0, Math.min(21600, secs)); const ch = msg.mentions.channels.first() || msg.channel; await ch.setRateLimitPerUser(secs).catch(()=>{}); await msg.channel.send(`Le slowmode a été activé dans ${ch} pour ${n}${unit}`); });
defineCommand('rename', async (msg) => { const name = msg.content.split(/\\s+/).slice(1).join(' '); if (!name) return void msg.channel.send('Usage: +rename <nom>'); await msg.guild.setName(name).catch(()=>{}); await msg.react('✅'); });

defineCommand('perms', async (msg) => { const cfg = getGuildConfig(msg.guild.id); const L = (n) => (cfg.settings.permLevels && cfg.settings.permLevels[n]) || []; const fmt = (arr) => arr.length ? arr.map(id=>`<@&${id}>`).join(', ') : 'Aucune'; const embed = new EmbedBuilder().setTitle('Permissions du serveur').setColor(0xFF0000).setDescription(['Perm 1',fmt(L('1')),'Perm 2',fmt(L('2')),'Perm 3',fmt(L('3')),'Perm 4',fmt(L('4')),'Perm 5',fmt(L('5')),'Perm 6',fmt(L('6')),'Perm 9',fmt(L('9'))].join('\n')).setFooter({ text: 'ζ͜͡Nexus Support' }); await msg.channel.send({ embeds: [embed] }); });
defineCommand('set perm', async (msg) => { const args = msg.content.split(/\s+/).slice(2); const level = args[0]; const role = msg.mentions.roles.first(); if (!level||!role) return void msg.channel.send('Usage: +set perm <niveau(1-9)> <@rôle>'); if (!/^([1-6]|9)$/.test(level)) return void msg.channel.send('Niveau invalide.'); const cfg = getGuildConfig(msg.guild.id); cfg.settings.permLevels = cfg.settings.permLevels || { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '9': [] }; const arr = cfg.settings.permLevels[level]; if (!arr.includes(role.id)) arr.push(role.id); saveGuildConfig(msg.guild.id, cfg); await msg.channel.send(`La permission ${level} a été ajoutée à 1 rôle`); });
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
// Explicit handlers for modlog and message log with friendly texts and current-channel default
defineCommand('modlog', async (msg) => {
    if (!requireOwner(msg)) return;
    const parts = msg.content.split(/\s+/);
    const onoff = (parts[1] || '').toLowerCase();
    const cfg = getGuildConfig(msg.guild.id);
    if (onoff === 'on') {
        const ch = msg.mentions.channels.first() || msg.channel;
        cfg.settings.logs.modlog = ch.id;
        saveGuildConfig(msg.guild.id, cfg);
        return void msg.channel.send("Les logs de modération ont été activés");
    }
    if (onoff === 'off') {
        cfg.settings.logs.modlog = null;
        saveGuildConfig(msg.guild.id, cfg);
        return void msg.channel.send("Les logs de modération ont été désactivés");
    }
    return void msg.channel.send('Usage: +modlog <on/off> [#salon]');
});
defineCommand('message log', async (msg) => {
    if (!requireOwner(msg)) return;
    const parts = msg.content.split(/\s+/);
    const onoff = (parts[2] || '').toLowerCase();
    const cfg = getGuildConfig(msg.guild.id);
    if (onoff === 'on') {
        const ch = msg.mentions.channels.first() || msg.channel;
        cfg.settings.logs.messagelog = ch.id;
        saveGuildConfig(msg.guild.id, cfg);
        return void msg.channel.send("Les logs de messages ont été activés");
    }
    if (onoff === 'off') {
        cfg.settings.logs.messagelog = null;
        saveGuildConfig(msg.guild.id, cfg);
        return void msg.channel.send("Les logs de messages ont été désactivés");
    }
    return void msg.channel.send('Usage: +message log <on/off> [#salon]');
});
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
defineCommand('giveaway', async (msg) => {
    if (!requireOwner(msg)) return;

    function buildSettingsEmbed(settings) {
        const e = new EmbedBuilder()
            .setTitle('Settings Giveaway')
            .setColor(0xFF0000);
        const fields = [];
        fields.push({ name: 'Salon', value: settings.channelId ? `<#${settings.channelId}>` : 'Aucun', inline: true });
        fields.push({ name: 'Prix', value: settings.prize || 'Aucun', inline: true });
        fields.push({ name: 'Titre du message', value: settings.title || '—', inline: true });
        fields.push({ name: 'Description du message', value: settings.description || '—', inline: true });
        fields.push({ name: 'Réaction', value: settings.reaction || '🎉', inline: true });
        fields.push({ name: 'Se termine dans', value: settings.durationText || '—', inline: true });
        fields.push({ name: 'Nombre de gagnants', value: String(settings.numWinners || 1), inline: true });
        fields.push({ name: 'Lanceur du giveaway', value: settings.requireLauncher ? 'Oui' : 'Non', inline: true });
        fields.push({ name: 'Gagnant imposé', value: settings.forcedWinnerId ? `<@${settings.forcedWinnerId}>` : 'Non', inline: true });
        e.addFields(fields);
        return e;
    }

    function buildMenu(customId) {
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(customId)
                .setPlaceholder('Modifier/Lancer')
                .addOptions(
                    { label: 'Salon', value: 'channel' },
                    { label: 'Prix', value: 'prize' },
                    { label: 'Titre du message', value: 'title' },
                    { label: 'Description du message', value: 'description' },
                    { label: 'Réaction', value: 'reaction' },
                    { label: 'Durée', value: 'duration' },
                    { label: 'Nombre de gagnants', value: 'winners' },
                    { label: 'Lanceur du giveaway', value: 'launcher' },
                    { label: 'Gagnant imposé', value: 'forced' },
                    { label: 'Lancer le giveaway', value: 'start' }
                )
        );
    }

    function parseDurationToMs(text) {
        const m = String(text).trim().match(/^(\d+)\s*(s|m|h|d)$/i);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        const unit = m[2].toLowerCase();
        if (unit === 's') return n * 1000;
        if (unit === 'm') return n * 60 * 1000;
        if (unit === 'h') return n * 60 * 60 * 1000;
        if (unit === 'd') return n * 24 * 60 * 60 * 1000;
        return null;
    }

    function humanizeMsFr(ms) {
        const s = Math.round(ms / 1000);
        if (s < 60) return `${s} seconde${s>1?'s':''}`;
        const m = Math.round(s / 60);
        if (m < 60) return `${m} minute${m>1?'s':''}`;
        const h = Math.round(m / 60);
        if (h < 24) return `${h} heure${h>1?'s':''}`;
        const d = Math.round(h / 24);
        return `${d} jour${d>1?'s':''}`;
    }

    function extractEmojiIdentifier(input) {
        const trimmed = input.trim();
        const custom = trimmed.match(/^<a?:([A-Za-z0-9_]+):(\d+)>$/);
        if (custom) return `${custom[1]}:${custom[2]}`;
        return trimmed; // assume unicode
    }

    // Load previous settings from store if any
    const db0 = readStore();
    db0.giveawayDefaults = db0.giveawayDefaults || {};
    const prev = db0.giveawayDefaults[msg.guild.id] || {};
    const settings = {
        channelId: prev.channelId ?? null,
        prize: prev.prize ?? '',
        title: prev.title ?? '🎉 **GIVEAWAY** 🎉',
        description: prev.description ?? 'Réagis avec 🎉 pour participer au giveaway',
        reaction: prev.reaction ?? '🎉',
        durationText: prev.durationText ?? '12h',
        durationMs: prev.durationMs ?? (12 * 60 * 60 * 1000),
        numWinners: prev.numWinners ?? 1,
        requireLauncher: prev.requireLauncher ?? false,
        forcedWinnerId: prev.forcedWinnerId ?? null
    };

    const embed = buildSettingsEmbed(settings);
    const menuId = `gw_menu:${msg.id}:${Date.now()}`;
    const sent = await msg.channel.send({ embeds: [embed], components: [buildMenu(menuId)] });

    const componentCollector = sent.createMessageComponentCollector({ time: 10 * 60 * 1000 });
    componentCollector.on('collect', async (i) => {
        if (i.user.id !== msg.author.id) return i.reply({ content: 'Seul l\'auteur peut modifier ces paramètres.', ephemeral: true });
        if (i.customId !== menuId) return;
        const choice = i.values[0];
        const ask = async (question) => {
            const q = await msg.channel.send(question);
            const filter = (m) => m.author.id === msg.author.id && m.channelId === msg.channelId;
            const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 60_000 });
            const answer = collected.first();
            if (!answer) { try { await q.delete().catch(()=>{}); } catch {} return null; }
            const value = answer.content.trim();
            try { await answer.delete().catch(()=>{}); } catch {}
            try { await q.delete().catch(()=>{}); } catch {}
            return value;
        };

        if (choice === 'channel') {
            await i.deferUpdate();
            const value = await ask('Dans quel salon publier le giveaway ? Mentionne un salon ou donne un ID.');
            if (!value) return;
            let channelId = value.replace(/[^0-9]/g, '');
            const ch = msg.guild.channels.cache.get(channelId) || msg.mentions.channels.first();
            if (!ch) return;
            settings.channelId = ch.id;
            const db = readStore(); db.giveawayDefaults = db.giveawayDefaults||{}; db.giveawayDefaults[msg.guild.id] = { ...db.giveawayDefaults[msg.guild.id], channelId: settings.channelId }; writeStore(db);
        } else if (choice === 'prize') {
            await i.deferUpdate();
            const value = await ask('Quel est le prix du giveaway ?');
            if (!value) return;
            settings.prize = value;
            const db = readStore(); db.giveawayDefaults = db.giveawayDefaults||{}; db.giveawayDefaults[msg.guild.id] = { ...db.giveawayDefaults[msg.guild.id], prize: settings.prize }; writeStore(db);
        } else if (choice === 'title') {
            await i.deferUpdate();
            const value = await ask('Quel est le titre du message ?');
            if (!value) return;
            settings.title = value.slice(0, 256);
            const db = readStore(); db.giveawayDefaults = db.giveawayDefaults||{}; db.giveawayDefaults[msg.guild.id] = { ...db.giveawayDefaults[msg.guild.id], title: settings.title }; writeStore(db);
        } else if (choice === 'description') {
            await i.deferUpdate();
            const value = await ask('Quelle est la description du message ?');
            if (!value) return;
            settings.description = value.slice(0, 1900);
            const db = readStore(); db.giveawayDefaults = db.giveawayDefaults||{}; db.giveawayDefaults[msg.guild.id] = { ...db.giveawayDefaults[msg.guild.id], description: settings.description }; writeStore(db);
        } else if (choice === 'reaction') {
            await i.deferUpdate();
            const value = await ask('Quelle réaction utiliser ? (emoji unique)');
            if (!value) return;
            settings.reaction = value.trim();
            const db = readStore(); db.giveawayDefaults = db.giveawayDefaults||{}; db.giveawayDefaults[msg.guild.id] = { ...db.giveawayDefaults[msg.guild.id], reaction: settings.reaction }; writeStore(db);
        } else if (choice === 'duration') {
            await i.deferUpdate();
            const value = await ask('Combien va durer le giveaway ? (ex: 12h, 30m, 2d)');
            if (!value) return;
            const ms = parseDurationToMs(value);
            if (!ms) return;
            settings.durationText = value;
            settings.durationMs = ms;
            const db = readStore(); db.ggiveawayDefaults = db.giveawayDefaults||{}; db.giveawayDefaults[msg.guild.id] = { ...db.giveawayDefaults[msg.guild.id], durationText: settings.durationText, durationMs: settings.durationMs }; writeStore(db);
        } else if (choice === 'winners') {
            await i.deferUpdate();
            const value = await ask('Combien de gagnants ? (nombre entier)');
            if (!value) return;
            const n = parseInt(value, 10);
            if (!Number.isFinite(n) || n < 1 || n > 50) return;
            settings.numWinners = n;
            const db = readStore(); db.giveawayDefaults = db.giveawayDefaults||{}; db.giveawayDefaults[msg.guild.id] = { ...db.giveawayDefaults[msg.guild.id], numWinners: settings.numWinners }; writeStore(db);
        } else if (choice === 'launcher') {
            await i.deferUpdate();
            const value = await ask('Activer le lanceur du giveaway ? (oui/non)');
            if (!value) return;
            settings.requireLauncher = /^oui$/i.test(value);
            const db = readStore(); db.giveawayDefaults = db.giveawayDefaults||{}; db.giveawayDefaults[msg.guild.id] = { ...db.giveawayDefaults[msg.guild.id], requireLauncher: settings.requireLauncher }; writeStore(db);
        } else if (choice === 'forced') {
            await i.deferUpdate();
            const value = await ask('Gagnant imposé ? (mention/ID ou "non")');
            if (!value) return;
            if (/^non$/i.test(value)) settings.forcedWinnerId = null;
            else {
                const id = value.replace(/[^0-9]/g, '');
                settings.forcedWinnerId = id || null;
            }
            const db = readStore(); db.giveawayDefaults = db.giveawayDefaults||{}; db.giveawayDefaults[msg.guild.id] = { ...db.giveawayDefaults[msg.guild.id], forcedWinnerId: settings.forcedWinnerId }; writeStore(db);
        } else if (choice === 'start') {
            await i.deferUpdate();
            const channel = (settings.channelId && msg.guild.channels.cache.get(settings.channelId)) || msg.channel;
            const now = new Date();
            const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const gwEmbed = new EmbedBuilder()
                .setTitle('🎉 GIVEAWAY 🎉')
                .setDescription([
                    settings.prize || 'Aucun',
                    `Réagis avec ${settings.reaction} pour participer au giveaway!`,
                    `Se termine: dans ${humanizeMsFr(settings.durationMs)}`
                ].join('\n'))
                .setColor(0xFF0000)
                .setFooter({ text: `${msg.guild.name}•Aujourd'hui à ${timeStr}` });
            const gwMsg = await channel.send({ embeds: [gwEmbed] });
            const emojiIdent = extractEmojiIdentifier(settings.reaction);
            try { await gwMsg.react(emojiIdent); } catch {}

            // Persist current settings as defaults for next time
            const db = readStore(); db.giveawayDefaults = db.giveawayDefaults||{}; db.giveawayDefaults[msg.guild.id] = { ...settings }; writeStore(db);

            // Schedule finish
            setTimeout(async () => {
                try {
                    const refreshed = await gwMsg.fetch();
                    const reactions = refreshed.reactions.cache;
                    // Collect participants
                    let users = [];
                    for (const r of reactions.values()) {
                        try {
                            const reactedUsers = await r.users.fetch();
                            for (const u of reactedUsers.values()) { if (!u.bot) users.push(u); }
                        } catch {}
                    }
                    // Deduplicate
                    const seen = new Set(); users = users.filter(u => (seen.has(u.id) ? false : (seen.add(u.id), true)));
                    if (settings.forcedWinnerId && !users.find(u => u.id === settings.forcedWinnerId)) {
                        const forcedUser = await gwMsg.client.users.fetch(settings.forcedWinnerId).catch(()=>null);
                        if (forcedUser) users.push(forcedUser);
                    }
                    const winners = [];
                    while (winners.length < settings.numWinners && users.length) {
                        const idx = Math.floor(Math.random()*users.length);
                        const pick = users.splice(idx,1)[0];
                        if (!winners.find(w=>w.id===pick.id)) winners.push(pick);
                    }
                    const winnerText = winners.length ? winners.map(w=>`<@${w.id}>`).join(', ') : 'Aucun participant';
                    const endedEmbed = EmbedBuilder.from(refreshed.embeds[0])
                        .setDescription([
                            settings.prize || 'Aucun',
                            `Réagis avec ${settings.reaction} pour participer au giveaway!`,
                            `Se termine: terminé`,
                            `Gagnant${winners.length>1?'s':''}: ${winnerText}`
                        ].join('\n'));
                    await refreshed.edit({ embeds: [endedEmbed] });
                    // Congratulate winners
                    if (winners.length) {
                        const congratsPrize = settings.prize && settings.prize.trim().length ? settings.prize : 'le giveaway';
                        await refreshed.channel.send(`Félicitations à ${winnerText} qui ${winners.length>1?'gagnent':'gagne'} ${congratsPrize}`);
                    }
                } catch {}
            }, Math.max(1000, settings.durationMs));
            return;
        }

        // Refresh settings embed after change
        try {
            await sent.edit({ embeds: [buildSettingsEmbed(settings)] });
        } catch {}
    });
});
defineCommand('end giveaway', async (msg) => {
    if (!requireOwner(msg)) return;
    const id = (msg.content.split(/\s+/).slice(2)[0] || '').trim();
    if (!id) return void msg.channel.send('Usage: +end giveaway <ID_message>');

    async function findMessageInGuild(guild, messageId) {
        for (const ch of guild.channels.cache.values()) {
            if (!ch || typeof ch.messages?.fetch !== 'function') continue;
            try {
                const m = await ch.messages.fetch(messageId);
                if (m) return m;
            } catch {}
        }
        return null;
    }

    try {
        const targetMsg = await findMessageInGuild(msg.guild, id);
        if (!targetMsg) return void msg.channel.send('Message introuvable.');

        // Determine prize from embed (first line of description)
        const original = targetMsg.embeds && targetMsg.embeds[0] ? targetMsg.embeds[0] : null;
        const lines = (original?.description || '').split('\n');
        const prize = (lines[0] || '').trim() || 'le giveaway';

        // Choose reaction with highest count
        let topReaction = null;
        for (const r of targetMsg.reactions.cache.values()) {
            if (!topReaction || (r.count || 0) > (topReaction.count || 0)) topReaction = r;
        }
        if (!topReaction) return void msg.channel.send('Aucune réaction trouvée sur ce message.');

        const reactedUsers = await topReaction.users.fetch();
        const pool = reactedUsers.filter(u => !u.bot);
        if (!pool.size) return void msg.channel.send('Aucun participant.');

        const arr = Array.from(pool.values());
        const winner = arr[Math.floor(Math.random() * arr.length)];
        const winnerText = `<@${winner.id}>`;

        // Update embed: mark finished and add winner line
        if (original) {
            const newLines = lines.slice();
            const endIdx = newLines.findIndex(l => /^Se termine:/i.test(l));
            if (endIdx >= 0) newLines[endIdx] = 'Se termine: terminé';
            const winIdx = newLines.findIndex(l => /^Gagnant/i.test(l));
            const newWinLine = `Gagnant: ${winnerText}`;
            if (winIdx >= 0) newLines[winIdx] = newWinLine; else newLines.push(newWinLine);
            const updated = EmbedBuilder.from(original).setDescription(newLines.join('\n'));
            await targetMsg.edit({ embeds: [updated] });
        }

        await msg.channel.send(`Félicitations à ${winnerText} qui gagne ${prize}`);
    } catch {
        await msg.channel.send('Impossible de terminer ce giveaway.');
    }
});
defineCommand('reroll', async (msg) => {
    if (!requireOwner(msg)) return;
    const id = (msg.content.split(/\s+/)[1] || '').trim();
    if (!id) return void msg.channel.send('Usage: +reroll <ID_message>');

    async function findMessageInGuild(guild, messageId) {
        for (const ch of guild.channels.cache.values()) {
            if (!ch || typeof ch.messages?.fetch !== 'function') continue;
            try {
                const m = await ch.messages.fetch(messageId);
                if (m) return m;
            } catch {}
        }
        return null;
    }

    try {
        const targetMsg = await findMessageInGuild(msg.guild, id);
        if (!targetMsg) return void msg.channel.send('Message introuvable.');

        // Choose reaction with highest count
        let topReaction = null;
        for (const r of targetMsg.reactions.cache.values()) {
            if (!topReaction || (r.count || 0) > (topReaction.count || 0)) topReaction = r;
        }
        if (!topReaction) return void msg.channel.send('Aucune réaction trouvée sur ce message.');

        const reactedUsers = await topReaction.users.fetch();
        const pool = reactedUsers.filter(u => !u.bot);
        if (!pool.size) return void msg.channel.send('Aucun participant.');

        const arr = Array.from(pool.values());
        const winner = arr[Math.floor(Math.random() * arr.length)];

        // Update embed to show new winner
        if (targetMsg.embeds && targetMsg.embeds[0]) {
            const original = targetMsg.embeds[0];
            const lines = (original.description || '').split('\n');
            const winIdx = lines.findIndex(l => /^Gagnant/i.test(l));
            const newLine = `Gagnant: <@${winner.id}>`;
            if (winIdx >= 0) lines[winIdx] = newLine; else lines.push(newLine);
            const updated = EmbedBuilder.from(original).setDescription(lines.join('\n'));
            await targetMsg.edit({ embeds: [updated] });
        }
        await msg.channel.send(`Nouveau gagnant: <@${winner.id}>`);
    } catch {
        await msg.channel.send('Reroll impossible.');
    }
});

// Backups
defineCommand('backup', async (msg) => {
    if (!requireOwner(msg)) return;
    const parts = msg.content.split(/\s+/).slice(1);
    const sub = (parts[0] || '').toLowerCase();
    const rawId = parts[1] || '';
    const guildId = rawId.replace(/[^0-9]/g, '');
    if (!['server','emoji'].includes(sub) || !guildId) {
        return void msg.channel.send('Usage: +backup <server/emoji> <guildId>');
    }
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return void msg.channel.send('Serveur introuvable (le bot doit y être).');

    try {
        const dir = path.join(process.cwd(), 'data', 'backups');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const ts = new Date();
        const tsStr = ts.toISOString().replace(/[:.]/g, '-');
        const indexFile = path.join(dir, 'index.json');
        let index = { items: [] };
        try { if (fs.existsSync(indexFile)) index = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch {}
        if (sub === 'emoji') {
            const emojis = guild.emojis.cache.map(e => ({ id: e.id, name: e.name, animated: e.animated, url: e.url }));
            const payload = { type: 'emoji', guildId: guild.id, guildName: guild.name, createdAt: ts.toISOString(), emojis };
            const idStr = `emoji_${guild.id}_${tsStr}`;
            const file = path.join(dir, `${idStr}.json`);
            fs.writeFileSync(file, JSON.stringify(payload, null, 2));
            index.items.push({ id: idStr, type: 'emoji', guildId: guild.id, guildName: guild.name, createdAt: ts.toISOString() });
            fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
            const embed = new EmbedBuilder()
                .setTitle('Backup Emoji créée')
                .setColor(0xFF0000)
                .addFields(
                    { name: 'Serveur', value: `${guild.name} (${guild.id})`, inline: false },
                    { name: 'Nombre d\'emojis', value: String(emojis.length), inline: true },
                    { name: 'ID de la backup', value: idStr, inline: true }
                )
                .setFooter({ text: `Créée le ${ts.toLocaleDateString('fr-FR')} à ${ts.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` });
            return void msg.channel.send({ embeds: [embed] });
        }
        if (sub === 'server') {
            const roles = guild.roles.cache
                .filter(r => r.id !== guild.id)
                .map(r => ({ id: r.id, name: r.name, color: r.hexColor, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString() }));
            const channels = guild.channels.cache.map(ch => ({ id: ch.id, name: ch.name, type: ch.type, parentId: ch.parentId || null, position: ch.position, topic: ch.topic || null, rateLimitPerUser: ch.rateLimitPerUser || 0 }));
            const payload = { type: 'server', guildId: guild.id, guildName: guild.name, createdAt: ts.toISOString(), iconURL: guild.iconURL(), bannerURL: guild.bannerURL(), roles, channels };
            const idStr = `server_${guild.id}_${tsStr}`;
            const file = path.join(dir, `${idStr}.json`);
            fs.writeFileSync(file, JSON.stringify(payload, null, 2));
            index.items.push({ id: idStr, type: 'server', guildId: guild.id, guildName: guild.name, createdAt: ts.toISOString() });
            fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
            const embed = new EmbedBuilder()
                .setTitle('Backup Serveur créée')
                .setColor(0xFF0000)
                .addFields(
                    { name: 'Serveur', value: `${guild.name} (${guild.id})`, inline: false },
                    { name: 'Rôles', value: String(roles.length), inline: true },
                    { name: 'Salons', value: String(channels.length), inline: true },
                    { name: 'ID de la backup', value: idStr, inline: false }
                )
                .setFooter({ text: `Créée le ${ts.toLocaleDateString('fr-FR')} à ${ts.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` });
            return void msg.channel.send({ embeds: [embed] });
        }
    } catch (e) {
        return void msg.channel.send('Erreur lors de la création de la backup.');
    }
});
defineCommand('backup list', async (msg) => {
    try {
        const dir = path.join(process.cwd(), 'data', 'backups');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const indexFile = path.join(dir, 'index.json');
        const args = msg.content.split(/\s+/).slice(2);

        // Parse filters: type (server|emoji) and scope (all|<guildId>)
        let typeFilter = null;
        let scopeArg = '';
        if ((args[0] || '').toLowerCase() === 'server' || (args[0] || '').toLowerCase() === 'emoji') {
            typeFilter = (args[0] || '').toLowerCase();
            scopeArg = (args[1] || '').toLowerCase();
        } else {
            scopeArg = (args[0] || '').toLowerCase();
        }

        // Load or rebuild index
        let index = { items: [] };
        const rebuild = () => {
            const items = [];
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json');
            for (const f of files) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                    const id = f.replace(/\.json$/,'');
                    const type = data.type || (id.startsWith('emoji_') ? 'emoji' : 'server');
                    const guildId = data.guildId || 'unknown';
                    const guildName = data.guildName || 'Inconnu';
                    const createdAt = data.createdAt || new Date().toISOString();
                    items.push({ id, type, guildId, guildName, createdAt });
                } catch {}
            }
            return { items };
        };
        if (fs.existsSync(indexFile)) {
            try { index = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch { index = { items: [] }; }
        }
        if (!index.items || !Array.isArray(index.items) || index.items.length === 0) {
            index = rebuild();
            try { fs.writeFileSync(indexFile, JSON.stringify(index, null, 2)); } catch {}
        }

        // Filter
        let items = index.items || [];
        if (typeFilter) items = items.filter(x => x.type === typeFilter);
        if (scopeArg && scopeArg !== 'all') {
            const gid = scopeArg.replace(/[^0-9]/g, '');
            if (gid) items = items.filter(x => x.guildId === gid);
            else items = items.filter(x => x.guildId === msg.guild.id);
        } else if (!scopeArg) {
            items = items.filter(x => x.guildId === msg.guild.id);
        }
        if (!items.length) return void msg.channel.send('Aucune backup.');

        // Sort newest first
        items.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));

        // Pagination (20 per page)
        const pageSize = 20;
        const pages = [];
        for (let i = 0; i < items.length; i += pageSize) pages.push(items.slice(i, i + pageSize));
        let page = 0;

        const makeEmbed = (pIdx) => {
            const slice = pages[pIdx];
            const title = typeFilter === 'emoji' ? 'Backups Emojis' : typeFilter === 'server' ? 'Backups Serveur' : 'Backups';
            const desc = slice.map(it => `• ${it.guildName} — \`${it.id}\``).join('\n');
            return new EmbedBuilder()
                .setTitle(title)
                .setColor(0xFF0000)
                .setDescription(desc)
                .setFooter({ text: `Page ${pIdx+1}/${pages.length}` });
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bklist_prev').setLabel('<').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('bklist_next').setLabel('>').setStyle(ButtonStyle.Secondary)
        );
        const sent = await msg.channel.send({ embeds: [makeEmbed(page)], components: [row] });
        const collector = sent.createMessageComponentCollector({ time: 3 * 60 * 1000 });
        collector.on('collect', async (i) => {
            if (i.user.id !== msg.author.id) return i.reply({ content: 'Seul l\'auteur peut naviguer ici.', ephemeral: true });
            const id = i.customId;
            if (id === 'bklist_prev') page = Math.max(0, page - 1);
            if (id === 'bklist_next') page = Math.min(pages.length - 1, page + 1);
            const newRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('bklist_prev').setLabel('<').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                new ButtonBuilder().setCustomId('bklist_next').setLabel('>').setStyle(ButtonStyle.Secondary).setDisabled(page === pages.length - 1)
            );
            await i.update({ embeds: [makeEmbed(page)], components: [newRow] });
        });
    } catch {
        await msg.channel.send('Impossible d\'afficher la liste des backups.');
    }
});
defineCommand('backup delete', async (msg) => {
    if (!requireOwner(msg)) return;
    const parts = msg.content.split(/\s+/).slice(2);
    let id = (parts[0] || '').trim();
    if (!id) return void msg.channel.send('Usage: +backup delete <ID>');

    try {
        const dir = path.join(process.cwd(), 'data', 'backups');
        const indexFile = path.join(dir, 'index.json');
        const filePath = path.join(dir, `${id}.json`);
        if (!fs.existsSync(filePath)) return void msg.channel.send('Backup introuvable.');
        const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const type = (payload && payload.type) || (id.startsWith('emoji_') ? 'emoji' : 'server');
        const guildName = payload.guildName || 'Inconnu';
        const guildId = payload.guildId || '—';

        // Confirmation embed
        const info = new EmbedBuilder()
            .setTitle(type === 'emoji' ? 'Supprimer une backup d\'emojis' : 'Supprimer une backup de serveur')
            .setColor(0xFF0000)
            .addFields(
                { name: 'Serveur', value: `${guildName} (${guildId})`, inline: false },
                { name: 'ID', value: id, inline: true },
                ...(type === 'emoji'
                    ? [{ name: 'Nombre d\'emojis', value: String((payload.emojis || []).length), inline: true }]
                    : [
                        { name: 'Rôles', value: String((payload.roles || []).length), inline: true },
                        { name: 'Salons', value: String((payload.channels || []).length), inline: true }
                      ])
            )
            .setFooter({ text: 'Confirmation requise' });

        const token = `bkdel:${msg.id}:${Date.now()}`;
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`${token}:confirm`).setLabel('Confirmer').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`${token}:cancel`).setLabel('Annuler').setStyle(ButtonStyle.Secondary)
        );
        const prompt = await msg.channel.send({ embeds: [info], components: [row] });

        const collector = prompt.createMessageComponentCollector({ time: 60 * 1000 });
        collector.on('collect', async (i) => {
            if (i.user.id !== msg.author.id) return i.reply({ content: 'Action réservée à l\'auteur.', ephemeral: true });
            if (!i.customId.startsWith(token)) return;
            const action = i.customId.split(':').pop();
            if (action === 'cancel') {
                await i.update({ content: 'Suppression annulée.', embeds: [], components: [] });
                return;
            }
            await i.update({ content: 'Suppression en cours...', embeds: [], components: [] });

            // Delete file
            let deleted = false;
            try { fs.unlinkSync(filePath); deleted = true; } catch {}
            // Update index
            try {
                if (fs.existsSync(indexFile)) {
                    const idx = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
                    idx.items = (idx.items || []).filter(x => x.id !== id);
                    fs.writeFileSync(indexFile, JSON.stringify(idx, null, 2));
                }
            } catch {}

            if (!deleted) {
                return void msg.channel.send('Impossible de supprimer cette backup.');
            }

            const done = new EmbedBuilder()
                .setTitle(type === 'emoji' ? 'Backup Emoji supprimée' : 'Backup Serveur supprimée')
                .setColor(0xFF0000)
                .addFields(
                    { name: 'Serveur', value: `${guildName} (${guildId})`, inline: false },
                    { name: 'ID', value: id, inline: true },
                    ...(type === 'emoji'
                        ? [{ name: 'Nombre d\'emojis', value: String((payload.emojis || []).length), inline: true }]
                        : [
                            { name: 'Rôles', value: String((payload.roles || []).length), inline: true },
                            { name: 'Salons', value: String((payload.channels || []).length), inline: true }
                          ])
                );
            await msg.channel.send({ embeds: [done] });
            await msg.channel.send(`Cette backup ${type === 'emoji' ? "d'emojis" : 'de serveur'} a bien été supprimée.`);
        });
    } catch {
        await msg.channel.send('Impossible d\'initialiser la suppression.');
    }
});
defineCommand('backup load', async (msg) => {
    if (!requireOwner(msg)) return;
    const parts = msg.content.split(/\s+/).slice(2);
    const idOrType = (parts[0] || '').toLowerCase();
    let id = parts[1] || '';
    // Allow calling with just ID: +backup load <id>
    if (!id) { id = idOrType; }

    if (!id) return void msg.channel.send('Usage: +backup load <ID>');

    const dir = path.join(process.cwd(), 'data', 'backups');
    const filePath = path.join(dir, `${id}.json`);
    if (!fs.existsSync(filePath)) return void msg.channel.send('Backup introuvable.');
    let payload;
    try { payload = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return void msg.channel.send('Backup invalide.'); }

    const type = (payload && payload.type) || (id.startsWith('emoji_') ? 'emoji' : 'server');
    if (!['emoji','server'].includes(type)) return void msg.channel.send('Type de backup inconnu.');

    const infoEmbed = new EmbedBuilder()
        .setTitle(type === 'emoji' ? 'Charger une backup d\'emojis' : 'Charger une backup de serveur')
        .setColor(0xFF0000)
        .addFields(
            { name: 'Serveur source', value: `${payload.guildName || 'Inconnu'} (${payload.guildId || '—'})`, inline: false },
            { name: 'ID de backup', value: id, inline: true },
            ...(type === 'emoji'
                ? [{ name: 'Nombre d\'emojis', value: String((payload.emojis || []).length), inline: true }]
                : [
                    { name: 'Rôles', value: String((payload.roles || []).length), inline: true },
                    { name: 'Salons', value: String((payload.channels || []).length), inline: true }
                  ])
        )
        .setFooter({ text: 'Confirmation requise' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bk_confirm').setLabel('Confirmer').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('bk_cancel').setLabel('Annuler').setStyle(ButtonStyle.Danger)
    );
    const sent = await msg.channel.send({ embeds: [infoEmbed], components: [row] });
    const collector = sent.createMessageComponentCollector({ time: 60 * 1000 });
    collector.on('collect', async (i) => {
        if (i.user.id !== msg.author.id) return i.reply({ content: 'Action réservée à l\'auteur.', ephemeral: true });
        if (i.customId === 'bk_cancel') {
            await i.update({ content: 'Chargement annulé.', embeds: [], components: [] });
            return;
        }
        if (i.customId !== 'bk_confirm') return;
        await i.update({ content: 'Chargement en cours...', embeds: [], components: [] });

        let createdRoles = 0, createdChannels = 0, createdEmojis = 0;
        try {
            if (type === 'emoji') {
                const list = payload.emojis || [];
                for (const e of list) {
                    try {
                        await msg.guild.emojis.create({ attachment: e.url, name: e.name });
                        createdEmojis++;
                    } catch {}
                }
            } else {
                // Create roles (basic attributes)
                const roles = payload.roles || [];
                for (const r of roles) {
                    try {
                        await msg.guild.roles.create({ name: r.name, color: r.color || undefined, hoist: !!r.hoist, mentionable: !!r.mentionable });
                        createdRoles++;
                    } catch {}
                }
                // Create categories first
                const cats = (payload.channels || []).filter(c => c.type === 4);
                const catIdMap = new Map();
                for (const c of cats) {
                    try {
                        const cat = await msg.guild.channels.create({ name: c.name, type: 4, position: c.position });
                        catIdMap.set(c.id, cat.id);
                        createdChannels++;
                    } catch {}
                }
                // Create other channels (text 0, voice 2)
                const others = (payload.channels || []).filter(c => c.type !== 4);
                for (const c of others) {
                    try {
                        const opts = { name: c.name, type: c.type };
                        const parentMapped = c.parentId && catIdMap.get(c.parentId);
                        if (parentMapped) opts.parent = parentMapped;
                        if (c.type === 0 && typeof c.rateLimitPerUser === 'number') opts.rateLimitPerUser = c.rateLimitPerUser;
                        if (c.type === 0 && c.topic) opts.topic = c.topic;
                        await msg.guild.channels.create(opts);
                        createdChannels++;
                    } catch {}
                }
            }
        } catch {}

        const done = new EmbedBuilder()
            .setTitle('Backup chargée')
            .setColor(0x00AA00)
            .setDescription(type === 'emoji'
                ? `Import d'emojis terminé: ${createdEmojis}/${(payload.emojis||[]).length}`
                : `Rôles créés: ${createdRoles}/${(payload.roles||[]).length}\nSalons créés: ${createdChannels}/${(payload.channels||[]).length}`);
        await msg.channel.send({ embeds: [done] });
    });
});

// Create emoji
defineCommand('create', async (msg) => {
    const args = msg.content.split(/\s+/).slice(1);
    const emojiInput = args[0] || '';
    const name = args.slice(1).join(' ') || 'custom';
    if (!emojiInput) return void msg.channel.send('Veuillez entrer un emoji valide.');

    // Try custom emoji format <a:name:id>
    const m = emojiInput.match(/^<a?:([A-Za-z0-9_]+):(\d+)>$/);
    try {
        if (m) {
            const id = m[2];
            const url = `https://cdn.discordapp.com/emojis/${id}.png?quality=lossless`;
            await msg.guild.emojis.create({ attachment: url, name });
            return void msg.channel.send("L'emoji a été créé avec succès.");
        }
        // Try unicode emoji rendered to Twemoji CDN fallback is not supported directly; must reject
        // If it's a standard unicode emoji, Discord API cannot create it as custom; require an image URL
        if (/^\p{Extended_Pictographic}$/u.test(emojiInput)) {
            return void msg.channel.send('Veuillez entrer un emoji custom ou une image URL.');
        }
        // Otherwise treat as URL
        const url = emojiInput;
        if (!/^https?:\/\//i.test(url)) return void msg.channel.send('Veuillez entrer un emoji valide.');
        await msg.guild.emojis.create({ attachment: url, name });
        return void msg.channel.send("L'emoji a été créé avec succès.");
    } catch {
        return void msg.channel.send('Veuillez entrer un emoji valide.');
    }
});

// News ticker, mass role, sync (stubs)
defineCommand('newsticker', async (msg) => { await msg.channel.send('Newsticker en cours d\'implémentation.'); });
defineCommand('massiverole', async (msg) => {
    if (!requireOwner(msg)) return;
    const settings = {
        action: 'add', // 'add' | 'del'
        roleId: null,
        filter: 'all' // 'all' | 'members' | 'bots'
    };

    const actionLabel = () => settings.action === 'add' ? 'Ajouter' : 'Retirer';
    const filterLabel = () => settings.filter === 'all' ? 'Tout le monde' : settings.filter === 'members' ? 'Membres uniquement' : 'Bots uniquement';

    function buildEmbed() {
        return new EmbedBuilder()
            .setTitle('Massrole Settings')
            .setColor(0xFF0000)
            .addFields(
                { name: 'Action', value: actionLabel(), inline: true },
                { name: 'Rôle', value: settings.roleId ? `<@&${settings.roleId}>` : '@membre', inline: true },
                { name: 'Filtre', value: filterLabel(), inline: true }
            );
    }

    function buildMenu(customId) {
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(customId)
                .setPlaceholder('Configurer / Lancer')
                .addOptions(
                    { label: 'Ajouter un rôle', value: 'set_action_add' },
                    { label: 'Retirer un rôle', value: 'set_action_del' },
                    { label: 'Modifier le rôle', value: 'set_role' },
                    { label: 'Modifier le filtre', value: 'set_filter' },
                    { label: 'Lancer', value: 'run' }
                )
        );
    }

    async function ask(prompt) {
        const q = await msg.channel.send(prompt);
        const filter = (m) => m.author.id === msg.author.id && m.channelId === msg.channelId;
        const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 60_000 });
        const answer = collected.first();
        if (!answer) { try { await q.delete().catch(()=>{}); } catch {} return null; }
        const value = answer.content.trim();
        try { await answer.delete().catch(()=>{}); } catch {}
        try { await q.delete().catch(()=>{}); } catch {}
        return value;
    }

    const menuId = `massrole:${msg.id}:${Date.now()}`;
    const sent = await msg.channel.send({ embeds: [buildEmbed()], components: [buildMenu(menuId)] });
    const collector = sent.createMessageComponentCollector({ time: 10 * 60 * 1000 });
    collector.on('collect', async (i) => {
        if (i.user.id !== msg.author.id) return i.reply({ content: 'Seul l\'auteur peut modifier ces paramètres.', ephemeral: true });
        if (i.customId !== menuId) return;
        const choice = i.values[0];
        await i.deferUpdate();
        if (choice === 'set_action_add') settings.action = 'add';
        else if (choice === 'set_action_del') settings.action = 'del';
        else if (choice === 'set_role') {
            const v = await ask('Mentionne un rôle ou donne un ID :'); if (v === null) return;
            const id = v.replace(/[^0-9]/g, '');
            const role = msg.guild.roles.cache.get(id) || msg.mentions.roles.first();
            if (!role) return;
            settings.roleId = role.id;
        } else if (choice === 'set_filter') {
            const v = await ask('Filtre ? (tout / membres / bots)'); if (v === null) return;
            const low = v.toLowerCase();
            if (low.startsWith('memb')) settings.filter = 'members';
            else if (low.startsWith('bot')) settings.filter = 'bots';
            else settings.filter = 'all';
        } else if (choice === 'run') {
            if (!settings.roleId) { await msg.channel.send('Sélectionne d\'abord un rôle.'); return; }
            const targetRole = msg.guild.roles.cache.get(settings.roleId);
            if (!targetRole) { await msg.channel.send('Rôle introuvable.'); return; }
            const meMember = msg.guild.members.me;
            if (!meMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) { await msg.channel.send("Je n'ai pas la permission de gérer les rôles."); return; }
            if (targetRole.position >= meMember.roles.highest.position) { await msg.channel.send("Je ne peux pas gérer ce rôle (position trop élevée)."); return; }
            const members = await msg.guild.members.fetch();
            const candidates = Array.from(members.values()).filter(member => {
                if (settings.filter === 'members' && member.user.bot) return false;
                if (settings.filter === 'bots' && !member.user.bot) return false;
                if (settings.action === 'add' && member.roles.cache.has(targetRole.id)) return false;
                if (settings.action === 'del' && !member.roles.cache.has(targetRole.id)) return false;
                return true;
            });
            const startMsg = await msg.channel.send(`Je suis en train d'${settings.action === 'add' ? 'ajouter' : 'retirer'} le rôle à ${candidates.length} membres`);
            let ok = 0, fail = 0;
            for (const member of candidates) {
                try {
                    if (settings.action === 'add') { await member.roles.add(targetRole); ok++; }
                    else { await member.roles.remove(targetRole); ok++; }
                } catch { fail++; }
            }
            const done1 = await msg.channel.send(`J'ai ${settings.action === 'add' ? 'ajouté' : 'retiré'} le rôle à ${ok} membres`);
            const done2 = await msg.channel.send(`Je n'ai pas pu ${settings.action === 'add' ? 'ajouter' : 'retirer'} le rôle à ${fail} membres`);
            setTimeout(async () => { try { await startMsg.delete().catch(()=>{}); await done1.delete().catch(()=>{}); await done2.delete().catch(()=>{}); } catch {} }, 8000);
        }
        try { await sent.edit({ embeds: [buildEmbed()] }); } catch {}
    });
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
defineCommand('ticket settings', async (msg) => {
    if (!requireOwner(msg)) return;
    const settings = {
        panelChannelId: null,
        title: '',
        description: '',
        categoryId: null,
        type: 'Boutons',
        options: ['Ouvrir un ticket']
    };

    function buildSettingsEmbed() {
        const ch = settings.panelChannelId ? (msg.guild.channels.cache.get(settings.panelChannelId) || null) : null;
        const cat = settings.categoryId ? (msg.guild.channels.cache.get(settings.categoryId) || null) : null;
        const optionsText = (settings.options && settings.options.length)
            ? settings.options.map((o,i)=> `${i+1} - ${o}`).join('\n')
            : '1 - Ouvrir un ticket';
        return new EmbedBuilder()
            .setTitle('Ticket Settings')
            .setColor(0xFF0000)
            .addFields(
                { name: 'Salon du panel', value: ch ? ch.toString() : 'Aucun', inline: true },
                { name: 'Titre du panel', value: settings.title || 'Aucun', inline: true },
                { name: 'Catégorie des tickets', value: cat ? (cat.name || 'Aucun') : 'Aucun', inline: true },
                { name: 'Type', value: settings.type, inline: true },
                { name: 'Description du panel', value: settings.description || 'Aucun', inline: true },
                { name: 'Options', value: optionsText, inline: true }
            )
            .setFooter({ text: 'ζ͜͡Nexus Support' });
    }

    function buildMenu(customId) {
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(customId)
                .setPlaceholder('Configurer / Envoyer')
                .addOptions(
                    { label: 'Modifier le salon du panel', value: 'set_channel' },
                    { label: 'Modifier le titre du panel', value: 'set_title' },
                    { label: 'Modifier la description du panel', value: 'set_desc' },
                    { label: 'Modifier le type Boutons/Sélecteurs', value: 'set_type' },
                    { label: 'Définir une catégorie des tickets', value: 'set_category' },
                    { label: 'Ajouter une option', value: 'add_option' },
                    { label: 'Supprimer une option', value: 'del_option' },
                    { label: 'Envoyer le panel', value: 'send_panel' }
                )
        );
    }

    async function ask(question) {
        const q = await msg.channel.send(question);
        const filter = (m) => m.author.id === msg.author.id && m.channelId === msg.channelId;
        const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 60_000 });
        const answer = collected.first();
        if (!answer) { try { await q.delete().catch(()=>{}); } catch {} return null; }
        const value = answer.content.trim();
        try { await answer.delete().catch(()=>{}); } catch {}
        try { await q.delete().catch(()=>{}); } catch {}
        return value;
    }

    const menuId = `ticket_settings:${msg.id}:${Date.now()}`;
    const sent = await msg.channel.send({ embeds: [buildSettingsEmbed()], components: [buildMenu(menuId)] });
    const collector = sent.createMessageComponentCollector({ time: 10 * 60 * 1000 });
    collector.on('collect', async (i) => {
        if (i.user.id !== msg.author.id) return i.reply({ content: 'Seul l\'auteur peut modifier ces paramètres.', ephemeral: true });
        if (i.customId !== menuId) return;
        const choice = i.values[0];
        await i.deferUpdate();
        if (choice === 'set_channel') {
            const v = await ask('Mentionne le salon du panel ou donne un ID :'); if (v===null) return;
            const id = v.replace(/[^0-9]/g, '');
            const ch = msg.guild.channels.cache.get(id) || msg.mentions.channels.first();
            if (!ch) return;
            settings.panelChannelId = ch.id;
        } else if (choice === 'set_title') {
            const v = await ask('Titre du panel :'); if (v===null) return; settings.title = v.slice(0, 256);
        } else if (choice === 'set_desc') {
            const v = await ask('Description du panel :'); if (v===null) return; settings.description = v.slice(0, 4000);
        } else if (choice === 'set_type') {
            const v = await ask('Type ? (boutons / selecteurs)'); if (v===null) return; const low = v.toLowerCase(); settings.type = low.startsWith('s') ? 'Sélecteurs' : 'Boutons';
        } else if (choice === 'set_category') {
            const v = await ask('Mentionne la catégorie des tickets ou donne un ID :'); if (v===null) return; const id = v.replace(/[^0-9]/g, ''); const cat = msg.guild.channels.cache.get(id) || msg.mentions.channels.first(); if (!cat || cat.type !== 4) return; settings.categoryId = cat.id;
        } else if (choice === 'add_option') {
            // Start option editor
            const opt = { name: 'Ouvrir le ticket', description: '', emoji: '', categoryId: null, requiredRoleIds: [], bannedRoleIds: [], ticketPermRoleIds: [] };
            function buildOptEmbed() {
                return new EmbedBuilder()
                    .setTitle("Ajout d'une option")
                    .setColor(0xFF0000)
                    .addFields(
                        { name: "Nom de l'option", value: opt.name || 'Ouvrir le ticket', inline: true },
                        { name: 'Description', value: opt.description || 'Aucun', inline: true },
                        { name: 'Emoji', value: opt.emoji || 'Aucun', inline: true },
                        { name: 'Catégorie', value: opt.categoryId ? (msg.guild.channels.cache.get(opt.categoryId)?.name || opt.categoryId) : 'Aucun', inline: true },
                        { name: 'Rôles Requis', value: opt.requiredRoleIds.length ? opt.requiredRoleIds.map(id=>`<@&${id}>`).join(', ') : 'Aucun', inline: true },
                        { name: 'Rôles Interdits', value: opt.bannedRoleIds.length ? opt.bannedRoleIds.map(id=>`<@&${id}>`).join(', ') : 'Aucun', inline: true },
                        { name: 'Permissions Tickets', value: opt.ticketPermRoleIds.length ? opt.ticketPermRoleIds.map(id=>`<@&${id}>`).join(', ') : 'Aucun', inline: true }
                    )
                    .setFooter({ text: 'ζ͜͡Nexus Support' });
            }
            function buildOptMenu(cid) {
                return new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(cid)
                        .setPlaceholder('Configurer option')
                        .addOptions(
                            { label: 'Modifier le nom', value: 'name' },
                            { label: 'Modifier la description', value: 'desc' },
                            { label: 'Supprimer la description', value: 'desc_clear' },
                            { label: "Modifier l'emoji", value: 'emoji' },
                            { label: "Supprimer l'emoji", value: 'emoji_clear' },
                            { label: 'Modifier la catégorie', value: 'category' },
                            { label: 'Supprimer la catégorie', value: 'category_clear' },
                            { label: 'Modifier les rôles requis', value: 'req_roles' },
                            { label: 'Modifier les rôles bannis', value: 'ban_roles' },
                            { label: 'Modifier les rôles permissions tickets', value: 'perm_roles' },
                            { label: 'Sauvegarder', value: 'save' }
                        )
                );
            }
            const optMenuId = `ticket_opt:${msg.id}:${Date.now()}`;
            const optMsg = await msg.channel.send({ embeds: [buildOptEmbed()], components: [buildOptMenu(optMenuId)] });
            const optCollector = optMsg.createMessageComponentCollector({ time: 10 * 60 * 1000 });
            optCollector.on('collect', async (ii) => {
                if (ii.user.id !== msg.author.id) return ii.reply({ content: 'Seul l\'auteur peut modifier.', ephemeral: true });
                if (ii.customId !== optMenuId) return;
                const val = ii.values[0];
                await ii.deferUpdate();
                if (val === 'name') { const v = await ask('Nom :'); if (v===null) return; opt.name = v.slice(0, 80); }
                else if (val === 'desc') { const v = await ask('Description :'); if (v===null) return; opt.description = v.slice(0, 1000); }
                else if (val === 'desc_clear') { opt.description = ''; }
                else if (val === 'emoji') { const v = await ask('Emoji (unicode ou <:name:id>) :'); if (v===null) return; opt.emoji = v.trim(); }
                else if (val === 'emoji_clear') { opt.emoji = ''; }
                else if (val === 'category') { const v = await ask('Catégorie (mention/ID) :'); if (v===null) return; const id = v.replace(/[^0-9]/g,''); const cat = msg.guild.channels.cache.get(id) || msg.mentions.channels.first(); if (cat && cat.type===4) opt.categoryId = cat.id; }
                else if (val === 'category_clear') { opt.categoryId = null; }
                else if (val === 'req_roles') { const v = await ask('Mentionne les rôles requis (séparés) :'); if (v===null) return; const roles = Array.from(msg.mentions.roles.values()).map(r=>r.id); opt.requiredRoleIds = roles; }
                else if (val === 'ban_roles') { const v = await ask('Mentionne les rôles bannis (séparés) :'); if (v===null) return; const roles = Array.from(msg.mentions.roles.values()).map(r=>r.id); opt.bannedRoleIds = roles; }
                else if (val === 'perm_roles') { const v = await ask('Mentionne les rôles ayant des permissions sur les tickets :'); if (v===null) return; const roles = Array.from(msg.mentions.roles.values()).map(r=>r.id); opt.ticketPermRoleIds = roles; }
                else if (val === 'save') { settings.options.push(opt); optCollector.stop('saved'); }
                try { await optMsg.edit({ embeds: [buildOptEmbed()] }); } catch {}
            });
        } else if (choice === 'del_option') {
            if (!settings.options.length) return;
            const v = await ask(`Quel numéro d\'option supprimer ? (1-${settings.options.length})`); if (v===null) return; const idx = parseInt(v,10)-1; if (idx>=0 && idx<settings.options.length) settings.options.splice(idx,1);
        } else if (choice === 'send_panel') {
            const channel = settings.panelChannelId ? (msg.guild.channels.cache.get(settings.panelChannelId) || msg.channel) : msg.channel;
            const panel = new EmbedBuilder().setColor(0xFF0000).setFooter({ text: 'ζ͜͡Nexus Support' });
            if (settings.title) panel.setTitle(settings.title);
            if (settings.description) panel.setDescription(settings.description);
            let components = [];
            if (settings.type === 'Boutons') {
                const row = new ActionRowBuilder();
                for (const label of settings.options.slice(0,5)) {
                    row.addComponents(new ButtonBuilder().setCustomId(`ticket_open:${label}`).setLabel(label).setStyle(ButtonStyle.Primary));
                }
                components = [row];
            } else {
                const menu = new StringSelectMenuBuilder().setCustomId('ticket_open_select').setPlaceholder('Choisir').addOptions(settings.options.slice(0,25).map(l => ({ label: l, value: l })));
                components = [new ActionRowBuilder().addComponents(menu)];
            }
            await channel.send({ embeds: [panel], components });
            await msg.channel.send(`Panel envoyé dans ${channel}`);
        }
        try { await sent.edit({ embeds: [buildSettingsEmbed()] }); } catch {}
    });
});
defineCommand('claim', async (msg) => { await msg.channel.send(`Le ticket a été claim par ${msg.author}`); });
defineCommand('add', async (msg) => { await msg.channel.send('Ajout au ticket en cours d\'implémentation.'); });
defineCommand('del', async (msg) => { await msg.channel.send('Retrait du ticket en cours d\'implémentation.'); });
defineCommand('close', async (msg) => { await msg.channel.send('Fermeture du ticket en cours d\'implémentation.'); });
defineCommand('tempvoc', async (msg) => { if (!requireOwner(msg)) return; const state = { step: 'start', voiceChannelId: null, categoryId: null, namePattern: '<user>.dpz' }; function embedStart(){ return new EmbedBuilder().setTitle('Paramètres des Vocaux Temporaires').setDescription('Choisissez une action dans le menu ci-dessous.').setColor(0xFF0000).setFooter({ text: 'ζ͜͡Nexus Support' }); } function embedPickVoice(){ return new EmbedBuilder().setTitle('Paramètres des Vocaux Temporaires').setDescription('Veuillez choisir un salon vocal').setColor(0xFF0000).setFooter({ text: 'ζ͜͡Nexus Support' }); } function embedSummary(){ const ch = state.voiceChannelId ? (msg.guild.channels.cache.get(state.voiceChannelId)||null) : null; const cat = state.categoryId ? (msg.guild.channels.cache.get(state.categoryId)||null) : null; return new EmbedBuilder().setTitle('Paramètres des Vocaux Temporaires').setColor(0xFF0000).setDescription(['Vocal 1',`Salon: ${ch?ch.toString():'Aucun'}`,`Catégorie: ${cat?('#'+cat.name):'Aucun'}`,state.namePattern].join('\n')).setFooter({ text: 'ζ͜͡Nexus Support' }); } function menuStart(id){ return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder('Sélectionner').addOptions({ label: 'Ajouter un salon', value: 'add' },{ label: 'Supprimer un salon', value: 'del' })); } function menuVoices(id){ const opts = []; for (const ch of msg.guild.channels.cache.values()){ if (ch.type===2) opts.push({ label: ch.name, value: ch.id }); } return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder('Choisir un salon vocal').addOptions(opts.slice(0,25))); } function menuCategories(id){ const opts = []; for (const ch of msg.guild.channels.cache.values()){ if (ch.type===4) opts.push({ label: ch.name, value: ch.id }); } return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder('Choisir une catégorie').addOptions(opts.slice(0,25))); } async function askName(){ const q = await msg.channel.send('Quel sera le nom des vocaux du serveur ? (<user> sera remplacé par le pseudo)'); const filter=(m)=>m.author.id===msg.author.id&&m.channelId===msg.channelId; const col=await msg.channel.awaitMessages({ filter, max:1, time:60000 }); const a=col.first(); if(!a){ try{await q.delete().catch(()=>{});}catch{} return null;} const val=a.content.trim(); try{await a.delete().catch(()=>{});}catch{} try{await q.delete().catch(()=>{});}catch{} return val; } const id1=`tempvoc:${msg.id}:${Date.now()}`; let sent=await msg.channel.send({ embeds:[embedStart()], components:[menuStart(id1)] }); const col=sent.createMessageComponentCollector({ time:10*60*1000 }); col.on('collect', async (i)=>{ if(i.user.id!==msg.author.id) return i.reply({ content:'Seul l\'auteur peut modifier.', ephemeral:true }); if(!i.customId.startsWith('tempvoc:')&&i.customId!==id1) return; const val=i.values[0]; await i.deferUpdate(); if(state.step==='start'){ if(val==='add'){ state.step='pick_voice'; await sent.edit({ embeds:[embedPickVoice()], components:[menuVoices(id1)] }); } else { state.step='delete_voice'; await sent.edit({ embeds:[new EmbedBuilder().setTitle('Paramètres des Vocaux Temporaires').setDescription('Sélectionne un salon à supprimer').setColor(0xFF0000).setFooter({ text:'ζ͜͡Nexus Support' })], components:[menuVoices(id1)] }); } return; } if(state.step==='pick_voice'){ state.voiceChannelId=val; state.step='pick_category'; await sent.edit({ embeds:[new EmbedBuilder().setTitle('Paramètres des Vocaux Temporaires').setDescription('Choisissez la catégorie des tickets').setColor(0xFF0000).setFooter({ text:'ζ͜͡Nexus Support' })], components:[menuCategories(id1)] }); return; } if(state.step==='pick_category'){ state.categoryId=val; state.step='ask_name'; const name=await askName(); if(!name) return; state.namePattern=name.replace(/<user>/g,'<user>'); // persist settings
 const cfg = getGuildConfig(msg.guild.id); cfg.settings.tempvoc = { hubId: state.voiceChannelId, categoryId: state.categoryId, namePattern: state.namePattern }; saveGuildConfig(msg.guild.id, cfg); state.step='summary'; await sent.edit({ embeds:[embedSummary()], components:[] }); return; } }); });
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
        // Permission gating: if any permLevels are set, only those roles (or owners) can use commands
        const member = message.member;
        const levels = (cfg.settings && cfg.settings.permLevels) || { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '9': [] };
        const allRoleIds = new Set([...(levels['1']||[]), ...(levels['2']||[]), ...(levels['3']||[]), ...(levels['4']||[]), ...(levels['5']||[]), ...(levels['6']||[]), ...(levels['9']||[])]);
        const isOwner = owners.has(message.author.id) || message.author.id === OWNER_ID;
        if (allRoleIds.size > 0 && !isOwner) {
            const hasAny = member.roles.cache.some(r => allRoleIds.has(r.id));
            if (!hasAny) return; // silently ignore if no perms
        }
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

// Reply with prefix when the bot is pinged with a bare mention
client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot || !message.guild) return;
        const content = message.content.trim();
        const match = content.match(/^<@!?([0-9]+)>$/);
        if (!match) return;
        if (!client.user || match[1] !== client.user.id) return;
        const cfg = getGuildConfig(message.guild.id);
        const currentPrefix = process.env.CHILD_PREFIX || cfg.prefix || PREFIX;
        await message.channel.send(`Mon prefix est \`${currentPrefix}\``);
    } catch {}
});

// Extend perms: manage per-level command allowlists
defineCommand('perm addcmd', async (msg) => {
    if (!requireOwner(msg)) return;
    const args = msg.content.split(/\s+/).slice(2);
    const level = args.shift();
    const cmd = args.join(' ').trim().toLowerCase();
    if (!/^([1-6]|9)$/.test(level) || !cmd) return void msg.channel.send('Usage: +perm addcmd <niveau(1-9)> <commande>');
    const cfg = getGuildConfig(msg.guild.id);
    cfg.settings.permCommands = cfg.settings.permCommands || { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '9': [] };
    const arr = cfg.settings.permCommands[level];
    if (!arr.includes(cmd)) arr.push(cmd);
    saveGuildConfig(msg.guild.id, cfg);
    await msg.channel.send(`Commande ajoutée au niveau ${level}.`);
});

defineCommand('perm delcmd', async (msg) => {
    if (!requireOwner(msg)) return;
    const args = msg.content.split(/\s+/).slice(2);
    const level = args.shift();
    const cmd = args.join(' ').trim().toLowerCase();
    if (!/^([1-6]|9)$/.test(level) || !cmd) return void msg.channel.send('Usage: +perm delcmd <niveau(1-9)> <commande>');
    const cfg = getGuildConfig(msg.guild.id);
    cfg.settings.permCommands = cfg.settings.permCommands || { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '9': [] };
    cfg.settings.permCommands[level] = (cfg.settings.permCommands[level] || []).filter(c => c !== cmd);
    saveGuildConfig(msg.guild.id, cfg);
    await msg.channel.send(`Commande retirée du niveau ${level}.`);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        const guild = newState.guild || oldState.guild;
        if (!guild) return;
        const cfg = getGuildConfig(guild.id);
        const tv = cfg.settings && cfg.settings.tempvoc;
        if (!tv || !tv.hubId) return;
        if ((!oldState.channelId || oldState.channelId !== tv.hubId) && newState.channelId === tv.hubId) {
            const displayName = newState.member?.displayName || newState.member?.user?.username || 'user';
            const name = (tv.namePattern || '<user>.dpz').replace(/<user>/g, displayName);
            const opts = { name, type: 2 };
            if (tv.categoryId) opts.parent = tv.categoryId;
            const temp = await guild.channels.create(opts).catch(()=>null);
            if (temp) await newState.setChannel(temp).catch(()=>{});
        }
        if (oldState.channel && oldState.channel.members.size === 0) {
            const ch = oldState.channel;
            const isTempByCat = tv.categoryId && ch.parentId === tv.categoryId && ch.id !== tv.hubId;
            const isTempByName = (tv.namePattern || '').includes('<user>') && ch.name && ch.name.includes('.dpz');
            if (isTempByCat || isTempByName) {
                try { await ch.delete().catch(()=>{}); } catch {}
            }
        }
    } catch {}
});

client.login(TOKEN);


