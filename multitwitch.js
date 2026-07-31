// Use Module Pattern to encapsulate logic and optimize performance
const MultitwitchApp = (function () {
    const state = {
        channels: { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' },
        userPaused: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false },
        draggedSlot: null,
        maxSlots: 6,
        activeChatTab: null,
        focusedSlot: null,
        visualOrder: { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60 },
        players: {}, // Contient les instances du SDK Twitch
        heartbeatInterval: null,
        fightIntervals: {}
    };

    const DOM = {}; // Cached DOM nodes
    const SLOTS = {}; // Cached per-slot nodes

    function initResizeObserver() {
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const width = entry.contentRect.width;
                const target = entry.target;

                target.classList.remove('container-sm', 'container-md', 'container-lg');

                if (width >= 650) {
                    target.classList.add('container-lg');
                } else if (width >= 450) {
                    target.classList.add('container-md');
                } else {
                    target.classList.add('container-sm');
                }
            }
        });
        if (DOM.mtVideos) {
            resizeObserver.observe(DOM.mtVideos);
        }
    }

    function initDOM() {
        DOM.mtVideos = document.getElementById('mt-videos');
        DOM.chatIframesContainer = document.getElementById('chat-iframes-container');
        DOM.addInput = document.getElementById('add-stream-input');
        DOM.toggleChatBtn = document.getElementById('toggle-chat-btn');
        DOM.fullscreenBtn = document.getElementById('fullscreen-btn');
        DOM.guideBtn = document.getElementById('guide-btn');
        if (document.getElementById('floating-exit-fs-btn')) DOM.floatingExitFsBtn = document.getElementById('floating-exit-fs-btn');

        // Nettoyage HTML : Génération dynamique des 6 slots vidéo
        if (DOM.mtVideos && DOM.mtVideos.children.length === 0) {
            const colors = { 1: 'var(--pixel-orange)', 2: '#9146FF', 3: 'var(--pixel-green)', 4: '#3b82f6', 5: '#ef4444', 6: '#eab308' };
            let cardsHtml = '';
            for (let i = 1; i <= state.maxSlots; i++) {
                const color = colors[i];
                cardsHtml += `
                <div id="card-stream-${i}" class="pixel-card bg-[#0f0f13] flex-col min-h-0 stream-card hidden" style="border: 2px solid ${color};" draggable="true">
                    <header class="px-2 py-1 flex justify-between items-center shrink-0 border-b bg-black/50 cursor-move" style="border-bottom-color: ${color};">
                        <div id="title-stream-${i}" class="font-pixel text-xs md:text-sm uppercase truncate pr-2" style="color: ${color};"></div>
                        <div class="flex items-center gap-2 md:gap-3">
                            <button class="play-pause-btn text-slate-400 hover:text-white transition-colors" data-slot="${i}" title="Lire/Pause">
                                <svg class="w-3 h-3 md:w-3.5 md:h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                            </button>
                            <button class="focus-stream-btn text-slate-400 hover:text-white transition-transform" data-slot="${i}" title="Mettre en évidence">
                                <svg class="w-3 h-3 md:w-3.5 md:h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
                                </svg>
                            </button>
                            <button class="remove-stream-btn text-[10px] md:text-xs text-gray-500 hover:text-red-500 font-pixel" data-slot="${i}">X</button>
                        </div>
                    </header>
                    <div id="container-stream-${i}" class="w-full bg-[#18181b] flex-grow relative min-h-0">
                        <div id="player-stream-${i}" class="absolute inset-0 w-full h-full z-10 invisible" style="box-shadow: 0 0 15px color-mix(in srgb, ${color} 15%, transparent);"></div>
                    </div>
                </div>`;
            }
            DOM.mtVideos.innerHTML = cardsHtml;
        }

        DOM.chatTabs = document.querySelectorAll('.chat-tab-btn');
        DOM.streamCards = document.querySelectorAll('.stream-card');

        for (let i = 1; i <= state.maxSlots; i++) {
            SLOTS[i] = {
                card: document.getElementById(`card-stream-${i}`),
                player: document.getElementById(`player-stream-${i}`),
                title: document.getElementById(`title-stream-${i}`),
                chatBtn: document.querySelector(`.chat-tab-btn[data-target="${i}"]`)
            };
            SLOTS[i].card.style.order = state.visualOrder[i];
            SLOTS[i].card.style.viewTransitionName = `card-${i}`;
            if (SLOTS[i].chatBtn) SLOTS[i].chatBtn.style.order = state.visualOrder[i];
        }
    }

    function bindEvents() {
        document.getElementById('add-stream-btn').addEventListener('click', addStream);
        DOM.addInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addStream();
        });

        DOM.toggleChatBtn.addEventListener('click', toggleChat);
        document.getElementById('share-btn').addEventListener('click', shareLayout);
        document.getElementById('reset-btn').addEventListener('click', resetStreams);

        document.getElementById('fix-connexion-btn').addEventListener('click', () => {
            window.open('https://www.twitch.tv/login', '_blank', 'width=500,height=600');
        });

        // Guide overlay toggle
        const guideOverlay = document.getElementById('guide-overlay');
        DOM.guideBtn.addEventListener('click', () => {
            guideOverlay.style.display = 'flex';
        });
        document.getElementById('guide-close-btn').addEventListener('click', () => {
            guideOverlay.style.display = 'none';
        });
        guideOverlay.addEventListener('click', (e) => {
            if (e.target === guideOverlay) guideOverlay.style.display = 'none';
        });

        // Event delegation for stream card controls
        document.querySelectorAll('.remove-stream-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const slot = parseInt(e.currentTarget.dataset.slot);
                if (slot) updateStream(slot, '');
            });
        });

        // Focus stream button
        document.querySelectorAll('.focus-stream-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const slot = parseInt(e.currentTarget.dataset.slot);
                toggleFocus(slot);
            });
        });

        // Chat tab switching
        DOM.chatTabs.forEach(btn => {
            btn.addEventListener('click', (e) => {
                switchChat(e.currentTarget.dataset.target);
            });
        });

        // Play/Pause buttons — toggles the player iframe on/off
        document.querySelectorAll('.play-pause-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const slot = parseInt(e.currentTarget.dataset.slot);
                togglePlay(slot);
            });
        });

        // Drag & Drop
        DOM.streamCards.forEach(card => {
            card.addEventListener('dragstart', (e) => {
                state.draggedSlot = parseInt(card.id.split('-').pop());
                e.dataTransfer.effectAllowed = 'move';
                requestAnimationFrame(() => {
                    card.style.opacity = '0.5';
                });
            });

            card.addEventListener('dragover', (e) => e.preventDefault());

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                const targetSlot = parseInt(card.id.split('-').pop());
                const sourceSlot = state.draggedSlot;

                DOM.streamCards.forEach(c => c.style.opacity = '1');

                if (sourceSlot === targetSlot || !sourceSlot) return;

                // Télémétrie : Analyse du Drag & Drop
                if (window.plausible) window.plausible('Drag and Drop', { props: { action: 'reorder' } });

                const performSwap = () => {
                    const tempOrder = state.visualOrder[sourceSlot];
                    state.visualOrder[sourceSlot] = state.visualOrder[targetSlot];
                    state.visualOrder[targetSlot] = tempOrder;

                    SLOTS[sourceSlot].card.style.order = state.visualOrder[sourceSlot];
                    SLOTS[targetSlot].card.style.order = state.visualOrder[targetSlot];

                    if (SLOTS[sourceSlot].chatBtn) SLOTS[sourceSlot].chatBtn.style.order = state.visualOrder[sourceSlot];
                    if (SLOTS[targetSlot].chatBtn) SLOTS[targetSlot].chatBtn.style.order = state.visualOrder[targetSlot];

                    updateLayout();
                    syncURL(); // Mettre à jour l'URL avec le nouvel ordre
                };

                if (document.startViewTransition) {
                    document.startViewTransition(() => performSwap());
                } else {
                    performSwap();
                }
                triggerAntiPauseMitraillette();
            });

            card.addEventListener('dragend', () => {
                DOM.streamCards.forEach(c => c.style.opacity = '1');
            });

            // --- Fonctionnalités Avancées (Tactile & Double Clic) ---
            const header = card.querySelector('header');
            if (header) {
                // Raccourci Focus : Double clic sur l'en-tête
                header.addEventListener('dblclick', () => {
                    const slot = parseInt(card.id.split('-').pop());
                    toggleFocus(slot);
                });

                // Drag & Drop Mobile / Tactile (L'API native est ignorée par iOS/Android)
                header.addEventListener('touchstart', (e) => {
                    if (e.touches.length > 1) return; // Ignore le multi-touch
                    state.draggedSlot = parseInt(card.id.split('-').pop());
                    card.style.opacity = '0.5';
                }, { passive: true });

                header.addEventListener('touchmove', (e) => {
                    if (e.cancelable) e.preventDefault(); // Empêche le scroll de page pendant qu'on glisse la carte
                }, { passive: false });

                header.addEventListener('touchend', (e) => {
                    card.style.opacity = '1';
                    if (!state.draggedSlot) return;

                    const touch = e.changedTouches[0];
                    // Détecte la carte au-dessus de laquelle le doigt s'est levé
                    const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
                    if (!dropTarget) {
                        state.draggedSlot = null;
                        return;
                    }

                    const targetCard = dropTarget.closest('.stream-card');
                    if (targetCard) {
                        const targetSlot = parseInt(targetCard.id.split('-').pop());
                        const sourceSlot = state.draggedSlot;

                        if (sourceSlot !== targetSlot && sourceSlot) {
                            if (window.plausible) window.plausible('Drag and Drop', { props: { action: 'reorder_touch' } });

                            const performSwap = () => {
                                const tempOrder = state.visualOrder[sourceSlot];
                                state.visualOrder[sourceSlot] = state.visualOrder[targetSlot];
                                state.visualOrder[targetSlot] = tempOrder;

                                SLOTS[sourceSlot].card.style.order = state.visualOrder[sourceSlot];
                                SLOTS[targetSlot].card.style.order = state.visualOrder[targetSlot];

                                if (SLOTS[sourceSlot].chatBtn) SLOTS[sourceSlot].chatBtn.style.order = state.visualOrder[sourceSlot];
                                if (SLOTS[targetSlot].chatBtn) SLOTS[targetSlot].chatBtn.style.order = state.visualOrder[targetSlot];

                                updateLayout();
                                syncURL();
                            };
                            if (document.startViewTransition) document.startViewTransition(() => performSwap());
                            else performSwap();
                            triggerAntiPauseMitraillette();
                        }
                    }
                    state.draggedSlot = null;
                });
            }
        });

        // Mobile menu
        const menuBtn = document.getElementById('mobile-menu-btn');
        const mobileMenu = document.getElementById('mobile-menu');
        const menuIcon = document.getElementById('mobile-menu-icon');
        if (menuBtn && mobileMenu && menuIcon) {
            menuBtn.addEventListener('click', () => {
                mobileMenu.classList.toggle('hidden');
                mobileMenu.classList.toggle('flex');
                if (mobileMenu.classList.contains('hidden')) {
                    menuIcon.setAttribute('d', 'M4 6h16M4 12h16M4 18h16');
                } else {
                    menuIcon.setAttribute('d', 'M6 18L18 6M6 6l12 12');
                }
            });
        }

        // Fullscreen
        if (DOM.fullscreenBtn) {
            DOM.fullscreenBtn.addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => { });
                } else {
                    document.exitFullscreen();
                }
            });
        }

        document.addEventListener('fullscreenchange', () => {
            const isFs = document.fullscreenElement !== null;
            document.body.classList.toggle('is-fullscreen', isFs);
            document.documentElement.classList.toggle('is-fullscreen', isFs);
            if (DOM.fullscreenBtn) DOM.fullscreenBtn.innerHTML = isFs ? '❌ QUITTER PLEIN ÉCRAN' : '📺 PLEIN ÉCRAN';
        });

        // Anti-pause on window focus
        window.addEventListener('focus', () => {
            triggerAntiPauseMitraillette();
        });
    }

    function startHeartbeat() {
        if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);

        state.heartbeatInterval = setInterval(() => {
            // On force la lecture même si document.hidden est détecté (sécurité renforcée)
            Object.keys(state.players).forEach(slot => {
                try {
                    const p = state.players[slot];
                    if (p && typeof p.getPaused === 'function' && p.getPaused() && !state.userPaused[slot]) {
                        p.play();
                    }
                } catch (e) { /* Ignore les erreurs des lecteurs corrompus */ }
            });
        }, 1000); // Vérification toutes les 1 seconde
    }

    function getTwitchParents() {
        const host = window.location.hostname;
        const parents = ['localhost', '127.0.0.1', 'prostrelezian.github.io', 'zlan.guill.tv'];
        if (host && !parents.includes(host)) parents.push(host);
        return parents;
    }

    function getParentParams() {
        return getTwitchParents().map(p => 'parent=' + p).join('&');
    }

    // Build the raw Twitch player iframe URL
    function getPlayerSrc(channel, muted = true) {
        const parentParams = getParentParams();
        return 'https://player.twitch.tv/?channel=' + channel + '&' + parentParams + '&muted=' + muted + '&autoplay=true';
    }

    function saveChannels() {
        localStorage.setItem('zlan_mt_channels', JSON.stringify(state.channels));
    }

    function syncURL() {
        const activeStreams = Object.keys(state.channels)
            .filter(slot => state.channels[slot])
            .sort((a, b) => state.visualOrder[a] - state.visualOrder[b])
            .map(slot => state.channels[slot]);

        const url = new URL(window.location.href);
        if (activeStreams.length > 0) {
            url.searchParams.set('streams', activeStreams.join(','));
        } else {
            url.searchParams.delete('streams');
        }
        window.history.replaceState({}, document.title, url.toString());
    }

    function updateLayout() {
        if (!DOM.mtVideos) return;
        let activeCount = 0;
        let lowestOrder = Infinity;
        let firstSlot = null;

        for (let i = 1; i <= state.maxSlots; i++) {
            const card = SLOTS[i].card;
            if (card) {
                const isActive = !!state.channels[i];
                if (isActive) {
                    activeCount++;
                    if (state.visualOrder[i] < lowestOrder) {
                        lowestOrder = state.visualOrder[i];
                        firstSlot = i;
                    }
                }
                // Avoid unnecessary reflows by checking first
                if (isActive && card.style.display !== 'flex') card.style.display = 'flex';
                if (!isActive && card.style.display !== 'none') card.style.display = 'none';

                card.classList.remove('is-visual-first');
            }
        }

        if (firstSlot && SLOTS[firstSlot].card) {
            SLOTS[firstSlot].card.classList.add('is-visual-first');
        }

        DOM.mtVideos.classList.remove('layout-0', 'layout-1', 'layout-2', 'layout-3', 'layout-4', 'layout-5', 'layout-6');
        DOM.mtVideos.classList.add(`layout-${activeCount}`);

        if (activeCount < 2 && state.focusedSlot) {
            state.focusedSlot = null;
            renderFocus();
        }
    }

    function toggleFocus(slot) {
        const performFocus = () => {
            if (state.focusedSlot === slot) {
                state.focusedSlot = null;
                if (window.plausible) window.plausible('Focus Mode', { props: { state: 'disabled' } });
            } else {
                state.focusedSlot = slot;
                if (window.plausible) window.plausible('Focus Mode', { props: { state: 'enabled' } });
            }
            renderFocus();
        };

        if (document.startViewTransition) {
            document.startViewTransition(() => performFocus());
        } else {
            performFocus();
        }

        triggerAntiPauseMitraillette();
    }

    function triggerAntiPauseMitraillette() {
        let attempts = 0;
        const fight = setInterval(() => {
            if (attempts++ > 20) {
                clearInterval(fight);
                return;
            }
            Object.keys(state.players).forEach(s => {
                const p = state.players[s];
                if (p && typeof p.play === 'function' && !state.userPaused[s]) {
                    try { p.play(); } catch (e) { }
                }
            });
        }, 50);
    }

    function renderFocus() {
        DOM.mtVideos.classList.remove('has-focus');
        DOM.streamCards.forEach(c => c.classList.remove('is-focused'));

        if (state.focusedSlot && state.channels[state.focusedSlot]) {
            DOM.mtVideos.classList.add('has-focus');
            const activeCard = SLOTS[state.focusedSlot].card;
            if (activeCard) {
                activeCard.classList.add('is-focused');
            }
        }
    }

    // Toggle a stream on/off
    function togglePlay(slot) {
        const player = state.players[slot];
        if (!player || typeof player.getPaused !== 'function') return;

        const btn = document.querySelector('.play-pause-btn[data-slot="' + slot + '"]');

        try {
            if (!player.getPaused()) {
                player.pause();
                state.userPaused[slot] = true;
                if (btn) btn.innerHTML = '<svg class="w-3 h-3 md:w-3.5 md:h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            } else {
                player.play();
                state.userPaused[slot] = false;
                if (btn) btn.innerHTML = '<svg class="w-3 h-3 md:w-3.5 md:h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
            }
        } catch (e) {
            console.warn(`[Toggle] Player ${slot} not ready yet.`);
        }
    }

    // Create a Twitch player using the official SDK
    async function createPlayerSDK(slot, channel) {
        if (!window.Twitch || !window.Twitch.Player) {
            console.error("[Twitch] SDK not found. Retrying in 1s...");
            setTimeout(() => createPlayerSDK(slot, channel), 1000);
            return;
        }

        const container = SLOTS[slot].player;
        if (!container) return;

        // 1. Préparation visuelle
        container.classList.remove('invisible');
        container.style.setProperty('display', 'block', 'important');

        // 2. Nettoyage des anciennes instances
        if (state.fightIntervals[slot]) {
            clearInterval(state.fightIntervals[slot]);
            state.fightIntervals[slot] = null;
        }
        if (state.players[slot]) {
            state.players[slot] = null;
            delete state.players[slot];
        }
        const oldPlayerIframe = container.querySelector('iframe');
        if (oldPlayerIframe) {
            oldPlayerIframe.src = '';
        }
        container.innerHTML = '';

        // 3. Création du nouveau lecteur
        const options = {
            width: '100%',
            height: '100%',
            channel: channel,
            parent: getTwitchParents(),
            muted: slot !== 1, // Son activé uniquement pour le premier slot par défaut
            autoplay: true
        };

        try {
            const player = new Twitch.Player(container, options);
            state.players[slot] = player;
            state.userPaused[slot] = false;

            player.addEventListener(Twitch.Player.READY, () => {
                if (state.players[slot]) {
                    state.players[slot].setQuality('480p');
                    state.players[slot].play();

                    // Les streams secondaires restent MUTE pour respecter l'Autoplay Policy du navigateur
                }
            });

            // Le moteur ANTI-PAUSE
            let pauseTimeout = null;
            player.addEventListener(Twitch.Player.PAUSE, () => {
                if (state.userPaused[slot] || !state.players[slot]) return;

                // Debounce pour éviter de spammer le SDK si le navigateur bloque l'autoplay
                clearTimeout(pauseTimeout);
                pauseTimeout = setTimeout(() => {
                    if (state.players[slot] && typeof state.players[slot].play === 'function') {
                        state.players[slot].play();
                    }
                }, 500);
            });
        } catch (err) {
            console.error(`[Twitch] Failed to init slot ${slot}:`, err);
        }
    }

    function updateStream(slot, channelName, switchChatToThis) {
        if (switchChatToThis === undefined) switchChatToThis = false;
        const newChannel = channelName ? channelName.trim().toLowerCase() : '';
        const oldChannel = state.channels[slot];

        if (newChannel === oldChannel && document.getElementById('iframe-player-' + slot)) return;

        const slotDOM = SLOTS[slot];
        let chatIframe = document.getElementById('iframe-chat-' + slot);

        const parentParams = getParentParams();

        if (newChannel) {
            // 1. On prépare le state et le layout immédiatement
            state.userPaused[slot] = false;
            state.channels[slot] = newChannel;
            updateLayout();

            // 2. Lancement du lecteur SDK
            createPlayerSDK(slot, newChannel);

            // Reset play/pause button to pause icon
            const ppBtn = document.querySelector('.play-pause-btn[data-slot="' + slot + '"]');
            if (ppBtn) {
                ppBtn.innerHTML = '<svg class="w-3 h-3 md:w-3.5 md:h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
            }

            // Dynamically create or update chat iframe
            if (!chatIframe) {
                chatIframe = document.createElement('iframe');
                chatIframe.id = 'iframe-chat-' + slot;
                chatIframe.className = 'w-full h-full keep-alive-hidden';
                chatIframe.setAttribute('frameborder', '0');
                chatIframe.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; storage-access');
                DOM.chatIframesContainer.appendChild(chatIframe);
            }

            const newSrc = 'https://www.twitch.tv/embed/' + newChannel + '/chat?' + parentParams + '&darkpopout';
            chatIframe.src = newSrc; // Chargement immédiat en arrière-plan
            chatIframe.dataset.src = newSrc;

            if (slotDOM.chatBtn) {
                slotDOM.chatBtn.textContent = newChannel.toUpperCase();
                slotDOM.chatBtn.classList.remove('hidden');
            }
            if (slotDOM.title) slotDOM.title.textContent = newChannel.toUpperCase();
        } else {
            // Remove stream
            state.channels[slot] = '';
            updateLayout();

            if (slotDOM.player) {
                if (state.fightIntervals[slot]) {
                    clearInterval(state.fightIntervals[slot]);
                    state.fightIntervals[slot] = null;
                }
                const oldIframe = slotDOM.player.querySelector('iframe');
                if (oldIframe) oldIframe.src = ''; // Libère la mémoire
                slotDOM.player.innerHTML = '';
                slotDOM.player.classList.add('invisible');
                if (state.players[slot]) delete state.players[slot];
            }

            if (chatIframe) {
                chatIframe.src = ''; // Libère la mémoire
                chatIframe.removeAttribute('data-src');
                chatIframe.remove();
            }

            if (slotDOM.chatBtn) {
                slotDOM.chatBtn.classList.add('hidden');
                if (state.activeChatTab == slot) {
                    // Find next available
                    var nextSlot = Object.keys(state.channels).find(function (k) { return state.channels[k] && k != slot; });
                    switchChat(nextSlot || null);
                }
            }
            if (slotDOM.title) slotDOM.title.textContent = '';

            if (state.focusedSlot === slot) {
                state.focusedSlot = null;
                renderFocus();
            }
        }

        saveChannels();
        syncURL();

        if (newChannel && switchChatToThis) {
            switchChat(slot);
        }

        // Déclenche l'anti-pause pour contrer les coupures dues au redimensionnement de la grille
        triggerAntiPauseMitraillette();
    }

    function switchChat(target) {
        if (state.activeChatTab == target) return;

        const oldTarget = state.activeChatTab;
        state.activeChatTab = target;

        if (oldTarget) {
            const oldIframe = document.getElementById('iframe-chat-' + oldTarget);
            if (oldIframe) {
                oldIframe.classList.remove('keep-alive-visible');
                oldIframe.classList.add('keep-alive-hidden');
            }

            const oldBtn = SLOTS[oldTarget] && SLOTS[oldTarget].chatBtn;
            if (oldBtn) {
                oldBtn.classList.remove('text-[var(--pixel-violet)]');
                oldBtn.classList.add('text-slate-500');
            }
        }

        if (target) {
            const iframe = document.getElementById('iframe-chat-' + target);
            if (iframe) {
                iframe.classList.remove('keep-alive-hidden');
                iframe.classList.add('keep-alive-visible');
            }

            const activeBtn = SLOTS[target] && SLOTS[target].chatBtn;
            if (activeBtn) {
                activeBtn.classList.remove('text-slate-500');
                activeBtn.classList.add('text-[var(--pixel-violet)]');
                activeBtn.classList.remove('hidden');
            }
        }

        // Le changement de tchat ou le clic sur un onglet peut provoquer une perte de focus
        // On déclenche la mitraillette anti-pause pour garantir la fluidité.
        triggerAntiPauseMitraillette();
    }

    async function addStream() {
        const newChannel = DOM.addInput.value.trim().toLowerCase();
        if (!newChannel) return;

        if (Object.values(state.channels).includes(newChannel)) {
            DOM.addInput.value = '';
            return;
        }

        let emptySlot = null;
        for (let i = 1; i <= state.maxSlots; i++) {
            if (!state.channels[i]) {
                emptySlot = i;
                break;
            }
        }

        if (!emptySlot) {
            alert("Vous avez déjà 6 streams actifs !");
            return;
        }

        const btn = document.getElementById('add-stream-btn');
        const oldBtnText = btn.textContent;
        btn.textContent = "AJOUT...";
        DOM.addInput.value = '';

        // Ajout optimiste instantané (Bypass API)
        updateStream(emptySlot, newChannel, true);
        if (window.plausible) window.plausible('Stream Added', { props: { channel: newChannel } });

        // Vérification API silencieuse en arrière-plan (au cas où la chaîne n'existe vraiment pas)
        try {
            const response = await fetch('https://decapi.me/twitch/id/' + newChannel);
            const text = await response.text();

            if (text.toLowerCase().includes("user not found") || text.includes("Error:")) {
                updateStream(emptySlot, ''); // Rétropédalage
                alert('La chaîne Twitch "' + newChannel + '" n\'existe pas.');
            }

        } catch (error) {
            console.warn("Vérification Twitch ignorée (erreur serveur tiers). Le stream reste actif.", error);
        } finally {
            btn.textContent = oldBtnText;
            DOM.addInput.focus();
        }
    }

    function resetStreams() {
        if (confirm("Voulez-vous vraiment réinitialiser les streams pour n'afficher que TheGuill84 et Nykho ?")) {
            const initial = { 1: 'theguill84', 2: 'nykho', 3: '', 4: '', 5: '', 6: '' };

            const performReset = () => {
                for (let i = 1; i <= state.maxSlots; i++) {
                    state.visualOrder[i] = i * 10;
                    SLOTS[i].card.style.order = state.visualOrder[i];
                    if (SLOTS[i].chatBtn) SLOTS[i].chatBtn.style.order = state.visualOrder[i];
                    updateStream(i, initial[i], false);
                }
                switchChat(1);
            };

            if (document.startViewTransition) {
                document.startViewTransition(() => performReset());
            } else {
                performReset();
            }
            triggerAntiPauseMitraillette();
        }
    }

    function shareLayout() {
        const activeStreams = Object.values(state.channels).filter(c => c);
        if (activeStreams.length === 0) {
            alert("Ajoutez au moins un stream !");
            return;
        }
        navigator.clipboard.writeText(window.location.href)
            .then(() => alert("Lien copié !"))
            .catch(() => alert("Erreur de copie : " + window.location.href));
    }

    function toggleChat() {
        const isHidden = document.body.classList.toggle('chat-hidden');
        if (isHidden) {
            DOM.toggleChatBtn.innerHTML = '<svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg> <span>AVEC TCHAT</span>';
            localStorage.setItem('zlan_mt_chat_hidden', 'true');
        } else {
            DOM.toggleChatBtn.innerHTML = '<svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg> <span>SANS TCHAT</span>';
            localStorage.setItem('zlan_mt_chat_hidden', 'false');
        }
    }

    function initializeApp() {
        initDOM();
        bindEvents();
        initResizeObserver();

        startHeartbeat(); // Démarre le moteur anti-pause

        // Clignotement du bouton Guide lors des 2 premières visites
        let visits = parseInt(localStorage.getItem('zlan_mt_visits') || '0', 10);
        visits++;
        localStorage.setItem('zlan_mt_visits', visits.toString());
        if (visits <= 2 && DOM.guideBtn) {
            DOM.guideBtn.classList.add('animate-pulse', 'shadow-[0_0_15px_var(--pixel-green)]');
            DOM.guideBtn.addEventListener('click', () => DOM.guideBtn.classList.remove('animate-pulse', 'shadow-[0_0_15px_var(--pixel-green)]'), { once: true });
        }

        // Load Chat Preferences
        if (localStorage.getItem('zlan_mt_chat_hidden') === 'true') {
            toggleChat(); // Toggles to hidden mode
        }

        // Load initial streams
        const params = new URLSearchParams(window.location.search);
        const urlStreams = params.get('streams');
        let initial = { 1: 'theguill84', 2: 'nykho', 3: '', 4: '', 5: '', 6: '' };

        if (urlStreams) {
            const streamsList = urlStreams.split(',');
            initial = { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' };
            streamsList.forEach((ch, idx) => { if (idx < 6) initial[idx + 1] = ch; });
            // Do not replace state here, syncURL() inside updateStream will handle it.
        } else {
            const saved = localStorage.getItem('zlan_mt_channels');
            if (saved) {
                try { initial = JSON.parse(saved); } catch (e) { }
            }
        }

        // Initial layout setup required before adding streams
        updateLayout();

        let firstActive = null;
        for (let i = 1; i <= state.maxSlots; i++) {
            if (initial[i]) {
                updateStream(i, initial[i], false);
                if (!firstActive) firstActive = i;
            }
        }
        if (firstActive) switchChat(firstActive);
    }

    return {
        init: initializeApp,
        triggerAntiPause: triggerAntiPauseMitraillette
    };
})();

// Start Application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', MultitwitchApp.init);
} else {
    MultitwitchApp.init();
}