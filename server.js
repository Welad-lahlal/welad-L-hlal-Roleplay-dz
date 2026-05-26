
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Discord Bot Configuration ───────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

// Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

client.once('ready', async () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`📊 Serving guild: ${GUILD_ID}`);
    console.log(`📁 Category ID: ${CATEGORY_ID}`);
    console.log(`👑 Admin Role ID: ${ADMIN_ROLE_ID}`);

    // Register slash commands
    const commands = [
        {
            name: 'close',
            description: 'إغلاق التذكرة الحالية',
            defaultMemberPermissions: '0'
        }
    ];

    try {
        await client.application.commands.set(commands, GUILD_ID);
        console.log('✅ Slash commands registered');
    } catch (err) {
        console.error('❌ Error registering slash commands:', err);
    }
});

// ─── Interaction Handler (Buttons & Slash Commands) ───────────────────
client.on('interactionCreate', async (interaction) => {
    console.log('🎯 Interaction received:', interaction.type, interaction.customId);

    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'close') {
            // Check if user is staff
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const isStaff = member.roles.cache.has(ADMIN_ROLE_ID);

            if (!isStaff) {
                await interaction.reply({ content: '❌ هذا الأمر متاح فقط للمشرفين!', ephemeral: true });
                return;
            }

            console.log(`🔘 /close command used by ${interaction.user.username} in channel ${interaction.channel.name}`);
            
            await interaction.reply({ content: '🔒 جاري إغلاق التذكرة...' });
            
            setTimeout(() => {
                interaction.channel.delete()
                    .then(() => console.log(`✅ Channel ${interaction.channel.name} deleted`))
                    .catch(err => console.error('❌ Failed to delete channel:', err));
            }, 2000);
        }
    }

    // Handle buttons
    if (interaction.isButton()) {
        const { customId, channel, user } = interaction;
        console.log('🔘 Button clicked:', customId, 'by:', user.username);

        if (customId === 'close_ticket') {
            console.log(`🔘 Close button clicked by ${user.username} in channel ${channel.name}`);
            
            try {
                await interaction.reply({ content: '🔒 سيتم إغلاق هذه التذكرة خلال 2 ثوانٍ...' });
                console.log('✅ Reply sent successfully');
                
                setTimeout(() => {
                    channel.delete()
                        .then(() => console.log(`✅ Channel ${channel.name} deleted`))
                        .catch(err => console.error('❌ Failed to delete channel:', err));
                }, 2000);
            } catch (err) {
                console.error('❌ Error handling close button:', err);
            }
        }
    }
});

// Login to Discord
if (BOT_TOKEN) {
    console.log('🔐 Logging in to Discord...');
    client.login(BOT_TOKEN).catch(err => {
        console.error('❌ Discord login error:', err);
    });
} else {
    console.warn('⚠️ BOT_TOKEN not set - Discord bot will not start');
}

// ─── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from current directory
app.use(express.static(path.join(__dirname)));
app.use('/images', express.static(path.join(__dirname, 'images')));

// ─── GitHub API Configuration ───────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

// Helper: GitHub API request
async function githubRequest(endpoint, method = 'GET', body = null) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}${endpoint}`;
    const headers = {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    };

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'GitHub API error');
    }
    return response.json();
}

// Helper: Get file content from GitHub
async function getFileContent(path) {
    try {
        const data = await githubRequest(`/contents/${path}`);
        if (data.type !== 'file') return null;
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`Error getting file ${path}:`, err);
        return [];
    }
}

// Helper: Save file content to GitHub
async function saveFileContent(path, data) {
    try {
        let sha = null;
        try {
            const existing = await githubRequest(`/contents/${path}`);
            sha = existing.sha;
        } catch (err) {
            // File doesn't exist, no sha needed
        }

        const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
        const body = {
            message: `Update ${path}`,
            content,
            sha
        };

        await githubRequest(`/contents/${path}`, 'PUT', body);
        console.log(`✅ Saved ${path} to GitHub`);
        return true;
    } catch (err) {
        console.error(`Error saving file ${path}:`, err);
        return false;
    }
}

// Helper: Delete file from GitHub
async function deleteFileContent(path) {
    try {
        const existing = await githubRequest(`/contents/${path}`);
        const body = {
            message: `Delete ${path}`,
            sha: existing.sha
        };

        await githubRequest(`/contents/${path}`, 'DELETE', body);
        console.log(`✅ Deleted ${path} from GitHub`);
        return true;
    } catch (err) {
        console.error(`Error deleting file ${path}:`, err);
        return false;
    }
}

// ─── API Routes ───────────────────────────────────────────────

// GET all items from a table
app.get('/products/:table', async (req, res) => {
    try {
        const filePath = `data/${req.params.table}.json`;
        const data = await getFileContent(filePath);
        res.json({ success: true, data });
    } catch (err) {
        console.error('❌ GET error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST new item to a table
app.post('/products/:table', async (req, res) => {
    try {
        const filePath = `data/${req.params.table}.json`;
        const data = await getFileContent(filePath);
        const newItem = { ...req.body, id: Date.now(), created_at: new Date().toISOString() };
        data.push(newItem);
        const saved = await saveFileContent(filePath, data);
        if (saved) {
            res.json({ success: true, data: newItem });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save' });
        }
    } catch (err) {
        console.error('❌ POST error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE item from a table
app.delete('/products/:table/:id', async (req, res) => {
    try {
        const filePath = `data/${req.params.table}.json`;
        const data = await getFileContent(filePath);
        const filtered = data.filter(item => item.id != req.params.id);
        const saved = await saveFileContent(filePath, filtered);
        if (saved) {
            res.json({ success: true, message: 'Deleted successfully' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to delete' });
        }
    } catch (err) {
        console.error('❌ DELETE error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Orders API ───────────────────────────────────────────────

// POST create order
app.post('/create-order', async (req, res) => {
    try {
        const { orderId, username, discordId, items, total } = req.body;
        const filePath = 'data/orders.json';
        const orders = await getFileContent(filePath);
        const newOrder = {
            id: orderId,
            username,
            discord_id: discordId,
            items,
            total,
            status: 'pending',
            processed: false,
            discordSent: false,
            date: new Date().toISOString()
        };
        orders.push(newOrder);
        const saved = await saveFileContent(filePath, orders);
        if (saved) {
            res.json({ success: true, orderId: newOrder.id });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save order' });
        }
    } catch (err) {
        console.error('❌ Create order error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST accept order
app.post('/accept-order', async (req, res) => {
    try {
        const { orderId } = req.body;
        const filePath = 'data/orders.json';
        const orders = await getFileContent(filePath);
        const orderIndex = orders.findIndex(o => o.id === orderId);
        if (orderIndex === -1) return res.status(404).json({ success: false, error: 'Order not found' });
        orders[orderIndex].status = 'completed';
        orders[orderIndex].processed = true;
        orders[orderIndex].discordSent = true;
        const saved = await saveFileContent(filePath, orders);
        if (saved) {
            res.json({ success: true, order: orders[orderIndex] });
        } else {
            res.status(500).json({ success: false, error: 'Failed to update order' });
        }
    } catch (err) {
        console.error('❌ Accept order error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Discord Ticket API ───────────────────────────────────────────────

// POST create Discord ticket
app.post('/create-ticket', async (req, res) => {
    try {
        console.log('📥 Received ticket request:', req.body);
        
        const { username, discordId, items, total } = req.body;

        // Validate required fields
        if (!username) {
            console.log('❌ Username is missing');
            return res.status(400).json({ error: 'Username is required' });
        }

        if (!items || items.length === 0) {
            console.log('❌ Cart is empty');
            return res.status(400).json({ error: 'Cart is empty' });
        }

        if (!total) {
            console.log('❌ Total is missing');
            return res.status(400).json({ error: 'Total is required' });
        }

        if (!client.isReady()) {
            console.log('❌ Discord bot is not ready');
            return res.status(500).json({ error: 'Discord bot is not ready' });
        }

        console.log('🔍 Fetching guild:', GUILD_ID);
        const guild = await client.guilds.fetch(GUILD_ID);
        if (!guild) {
            console.log('❌ Guild not found');
            return res.status(500).json({ error: 'Guild not found' });
        }
        console.log('✅ Guild found:', guild.name);

        // Build safe channel name
        const safeName = username
            .toLowerCase()
            .replace(/[^a-z0-9\u0600-\u06ff]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 20) || 'user';
        const channelName = `ticket-${safeName}`;
        console.log('📝 Creating channel:', channelName, 'in category:', CATEGORY_ID);

        // Create ticket channel inside category
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: CATEGORY_ID,
            topic: `🛒 Order ticket for ${username}`,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: ADMIN_ROLE_ID,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                },
                {
                    id: client.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.UseApplicationCommands]
                }
            ]
        });
        console.log('✅ Channel created:', channel.name, 'ID:', channel.id);

        // Build items list for embed
        const itemsList = items.map(item => {
            const typeEmoji = {
                vehicle: '🚗',
                house: '🏠',
                mapping: '🗺️',
                accessoires: '💎',
                character: '👤',
                job: '💼'
            }[item.type] || '📦';
            return `${typeEmoji} **${item.name}** — $${item.price}`;
        }).join('\n');

        // Build professional embed
        const embed = new EmbedBuilder()
            .setTitle('🛒 طلب جديد — New Order')
            .setColor(0x10b981)
            .setThumbnail('https://cdn.discordapp.com/embed/avatars/0.png')
            .addFields(
                {
                    name: '👤 العميل / Customer',
                    value: discordId ? `<@${discordId}>` : username,
                    inline: true
                },
                {
                    name: '💰 الإجمالي / Total',
                    value: `**$${total}**`,
                    inline: true
                },
                {
                    name: '📦 المنتجات / Items',
                    value: itemsList || 'No items'
                },
                {
                    name: '📋 التعليمات / Instructions',
                    value: 'سيتواصل معك أحد المشرفين قريباً لإتمام الطلب.\nAn admin will contact you shortly to complete your order.'
                }
            )
            .setFooter({ text: 'WLAD HLAL Store' })
            .setTimestamp();

        // Create buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('❌ Close Ticket')
                    .setStyle(ButtonStyle.Danger)
            );

        console.log('🔘 Button created');
        console.log('🔘 Sending message with button to channel:', channel.id);

        // Send embed with button in ticket channel
        const message = await channel.send({
            content: `<@&${ADMIN_ROLE_ID}> — طلب جديد يحتاج مراجعة! ${discordId ? `<@${discordId}>` : ''}`,
            embeds: [embed],
            components: [row]
        });
        console.log('✅ Message sent with button to channel');

        console.log(`✅ Ticket created successfully: #${channelName} for ${username}`);
        res.json({ 
            success: true, 
            channelId: channel.id, 
            channelName,
            message: 'Ticket created successfully'
        });

    } catch (err) {
        console.error('❌ Ticket creation error:', err.message);
        console.error('❌ Full error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET all orders
app.get('/orders', async (req, res) => {
    try {
        const filePath = 'data/orders.json';
        const orders = await getFileContent(filePath);
        res.json({ success: true, data: orders });
    } catch (err) {
        console.error('❌ GET orders error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Serve HTML Pages ─────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/store', (req, res) => res.sendFile(path.join(__dirname, 'store.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/faq', (req, res) => res.sendFile(path.join(__dirname, 'faq.html')));
app.get('/roster', (req, res) => res.sendFile(path.join(__dirname, 'roster.html')));
app.get('/team', (req, res) => res.sendFile(path.join(__dirname, 'team.html')));
app.get('/live', (req, res) => res.sendFile(path.join(__dirname, 'live.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'signup.html')));

// ─── Start Server ─────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📦 GitHub Repository: ${GITHUB_OWNER}/${GITHUB_REPO}`);
});
