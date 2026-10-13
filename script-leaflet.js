// =============================================================================
// Kampüs Harita Yönetim Sistemi - Leaflet GIS Motoru
// Birebir Screenshots 1, 2, 3, 4 Arayüzü & Fonksiyonelliği
// Solves: Issue 1 (Zoom Threshold: min/max_zoom) & Issue 2 (Earth Repeating: noWrap)
// Features: Katmanlar Ağaç Menüsü, Yönetim Paneli (Marker/Şekil Ekle, Yedekle),
//           Detaylar Paneli, Geoman Çizim Araçları, LocalStorage & GeoJSON Sync,
//           Ebeveyn (Parenting) İlişkisi, Fotoğraf Yükleme / Base64 & Düzenleme
// =============================================================================

const STORAGE_KEY = 'webgis_dummy_data_v7';
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASS = 'password';

// -----------------------------------------------------------------------------
// 1. Map Initialization (Solved Issue 2: noWrap: true & maxBounds)
// -----------------------------------------------------------------------------
const map = L.map('map', {
    center: [39.9365, 32.8245],
    zoom: 16,
    minZoom: 3,
    maxBounds: [[-90, -180], [90, 180]],
    maxBoundsViscosity: 1.0,
    zoomControl: false
});

L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.scale({ position: 'bottomright', metric: true, imperial: false }).addTo(map);

// Base Tile Layers (Solving Issue 2)
const hybridTileLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    attribution: 'Map data &copy; Google',
    maxZoom: 20,
    noWrap: true
});

const osmTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    noWrap: true
});

hybridTileLayer.addTo(map);
let currentBaseLayer = hybridTileLayer;

// -----------------------------------------------------------------------------
// 2. State Management
// -----------------------------------------------------------------------------
let campusData = { categories: [], markers: [], polygons: [] };

const markerLayersMap = new Map();       // markerId -> L.Layer
const polygonLayersMap = new Map();      // polygonId -> L.Layer
const polyCenterMarkersMap = new Map();  // polygonId -> L.Marker (center symbology badge)

const expandedCategories = {};      // catId -> boolean
const expandedItems = {};           // itemKey (m-X or p-X) -> boolean
const hiddenItems = {};             // itemId (m-X or p-X) -> boolean
const hiddenCategories = {};        // catId -> boolean

let selectedItem = null;            // Selected marker or polygon object
let isAdmin = sessionStorage.getItem('webgis_is_admin') === 'true';
let currentAdminTab = 'add-marker'; // 'add-marker' | 'add-polygon' | 'backup'
let mapMode = 'pan';                // 'pan' | 'add-marker' | 'add-polygon' | 'add-linestring' | 'delete'
let searchQuery = '';

// Active image list for form editing
let activeFormImages = [];

// Toast Notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.background = type === 'success' ? '#059669' : (type === 'error' ? '#dc2626' : '#0f172a');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// -----------------------------------------------------------------------------
// 3. Data Loading & Persistence
// -----------------------------------------------------------------------------
async function loadCampusData() {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
        try {
            campusData = JSON.parse(cached);
            initCategoryExpandedState();
            renderAllMapLayers();
            renderTreeSidebar();
            populateCategoryDropdowns();
            populateParentDropdowns();
            return;
        } catch (e) {
            console.error('LocalStorage parse error:', e);
        }
    }

    try {
        const res = await fetch('data/gis-data.json');
        campusData = await res.json();
    } catch {
        try {
            const fallback = await fetch('Public/data/gis-data.json');
            campusData = await fallback.json();
        } catch (err) {
            console.error('Data load error:', err);
            campusData = { categories: [], markers: [], polygons: [] };
        }
    }

    initCategoryExpandedState();
    saveDataToStorage();
    renderAllMapLayers();
    renderTreeSidebar();
    populateCategoryDropdowns();
    populateParentDropdowns();
}

function saveDataToStorage() {
    if (campusData) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(campusData));
    }
}

function getLucideIconName(icon) {
    if (!icon) return 'map-pin';
    const iconMap = {
        'TreePine': 'trees',
        'trees': 'trees',
        'GraduationCap': 'graduation-cap',
        'graduation-cap': 'graduation-cap',
        'Building': 'building',
        'Library': 'library',
        'Coffee': 'coffee',
        'Star': 'star',
        'Users': 'users',
        'Home': 'home',
        'MapPin': 'map-pin',
        'Hospital': 'hospital',
        'BookOpen': 'book-open',
        'MoonStar': 'moon',
        'Utensils': 'utensils',
        'Car': 'car',
        'Bus': 'bus',
        'Dumbbell': 'dumbbell',
        'Computer': 'laptop'
    };
    if (iconMap[icon]) return iconMap[icon];
    return icon.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function buildHierarchy() {
    const categories = campusData.categories || [];
    const catMap = new Map();
    categories.forEach(c => catMap.set(c.id, c));

    const allItems = [
        ...(campusData.markers || []).map(m => ({ ...m, type: 'marker', itemKey: 'm-' + m.id, children: [] })),
        ...(campusData.polygons || []).map(p => ({ ...p, type: 'polygon', itemKey: 'p-' + p.id, children: [] }))
    ];

    const itemMap = new Map();
    allItems.forEach(it => itemMap.set(it.itemKey, it));

    const rootItems = [];
    allItems.forEach(it => {
        let parentRef = null;
        if (it.parent_id) {
            const prefix = (it.parent_type === 'App\\Models\\Marker' || it.parent_type === 'marker') ? 'm-' : 'p-';
            parentRef = prefix + it.parent_id;
        }
        if (parentRef && itemMap.has(parentRef)) {
            itemMap.get(parentRef).children.push(it);
        } else {
            rootItems.push(it);
        }
    });

    // Compute depth for all items
    allItems.forEach(it => {
        let d = 0;
        let curr = it;
        while (curr && curr.parent_id) {
            d++;
            const prefix = (curr.parent_type === 'App\\Models\\Marker' || curr.parent_type === 'marker') ? 'm-' : 'p-';
            curr = itemMap.get(prefix + curr.parent_id);
        }
        it.depth = d;
    });

    const groupByCategory = (items) => {
        const groups = {};
        items.forEach(it => {
            const catId = it.category_id || 0;
            const catObj = catMap.get(catId) || { id: 0, name: 'Diğer', icon: 'MapPin', color: '#64748b' };
            if (!groups[catId]) {
                groups[catId] = {
                    id: catId,
                    name: catObj.name,
                    icon: catObj.icon,
                    color: catObj.color,
                    items: []
                };
            }
            groups[catId].items.push(it);
        });

        return Object.values(groups).sort((a, b) => {
            const catA = catMap.get(a.id);
            const catB = catMap.get(b.id);
            return (catA?.order ?? 99) - (catB?.order ?? 99);
        });
    };

    const recursivelyGroup = (items) => {
        items.forEach(it => {
            if (it.children.length > 0) {
                it.childCategories = groupByCategory(it.children);
                recursivelyGroup(it.children);
            }
        });
    };

    recursivelyGroup(rootItems);
    return { rootCategories: groupByCategory(rootItems), itemMap, allItems };
}

function initCategoryExpandedState() {
    (campusData.categories || []).forEach(cat => {
        if (expandedCategories['root_cat_' + cat.id] === undefined) {
            expandedCategories['root_cat_' + cat.id] = true;
        }
    });
    (campusData.polygons || []).forEach(p => {
        if (!p.parent_id && expandedItems['p-' + p.id] === undefined) {
            expandedItems['p-' + p.id] = true;
        }
    });
}

// -----------------------------------------------------------------------------
// 4. Map Layers Rendering (Polygons & Markers) - Child on top of Parent
// -----------------------------------------------------------------------------
function renderAllMapLayers() {
    markerLayersMap.forEach(layer => map.removeLayer(layer));
    polygonLayersMap.forEach(layer => map.removeLayer(layer));
    polyCenterMarkersMap.forEach(marker => map.removeLayer(marker));
    markerLayersMap.clear();
    polygonLayersMap.clear();
    polyCenterMarkersMap.clear();

    const currentZoom = map.getZoom();
    const { itemMap } = buildHierarchy();

    // 1. Polygons: sorted by depth ascending (root polygons first, child polygons strictly on top)
    const sortedPolygons = [...(campusData.polygons || [])].sort((a, b) => {
        const da = itemMap.get('p-' + a.id)?.depth || 0;
        const db = itemMap.get('p-' + b.id)?.depth || 0;
        return da - db;
    });

    sortedPolygons.forEach(p => {
        const geom = p.geojson || (p.coordinates ? { type: 'Polygon', coordinates: p.coordinates } : null);
        if (!geom) return;
        try {
            const geojsonObj = typeof geom === 'string' ? JSON.parse(geom) : geom;
            const cat = (campusData.categories || []).find(c => c.id === p.category_id);
            const color = cat?.color || '#3b82f6';
            const isHidden = hiddenCategories[p.category_id] || hiddenItems['p-' + p.id];
            const depth = itemMap.get('p-' + p.id)?.depth || 0;

            const layer = L.geoJSON(geojsonObj, {
                style: {
                    color: color,
                    weight: depth === 0 ? 2 : 2.5,
                    fillColor: color,
                    fillOpacity: depth === 0 ? 0.2 : 0.4
                }
            });

            layer.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                if (mapMode === 'delete') {
                    deleteElement(p, 'polygon');
                    return;
                }
                onElementClicked(p, 'polygon', layer);
            });

            polygonLayersMap.set(p.id, layer);

            // Center symbology badge for polygon
            let centerMarker = null;
            if (!p.hide_symbology && cat && cat.icon && cat.icon !== 'None') {
                const iconName = getLucideIconName(cat.icon);
                const polyDivIcon = L.divIcon({
                    className: 'symbology-poly-div-icon',
                    html: `<div class="symbology-badge poly-badge" style="border-color: ${color}; color: ${color};">
                        <i data-lucide="${iconName}"></i>
                    </div>`,
                    iconSize: [36, 36],
                    iconAnchor: [18, 18],
                    popupAnchor: [0, -18]
                });

                const centerLatLng = layer.getBounds().getCenter();
                centerMarker = L.marker(centerLatLng, {
                    icon: polyDivIcon,
                    zIndexOffset: 500 + depth * 100
                });

                centerMarker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (mapMode === 'delete') {
                        deleteElement(p, 'polygon');
                        return;
                    }
                    onElementClicked(p, 'polygon', layer);
                });

                polyCenterMarkersMap.set(p.id, centerMarker);
            }

            // Zoom threshold (Solved Issue 1)
            let zoomHidden = false;
            if (cat?.min_zoom && currentZoom < cat.min_zoom) zoomHidden = true;
            if (cat?.max_zoom && currentZoom > cat.max_zoom) zoomHidden = true;
            if (cat?.border_always_visible) zoomHidden = false;

            if (!isHidden && !zoomHidden) {
                layer.addTo(map);
                if (depth === 0) {
                    layer.bringToBack();
                } else {
                    layer.bringToFront();
                }
                if (centerMarker) {
                    centerMarker.addTo(map);
                }
            }
        } catch (err) {
            console.error('Polygon geojson error:', p, err);
        }
    });

    // 2. Markers: always on top of polygons, child markers on top of root markers
    (campusData.markers || []).forEach(m => {
        try {
            if (!m.latitude || !m.longitude) return;
            const cat = (campusData.categories || []).find(c => c.id === m.category_id);
            const color = cat?.color || '#3b82f6';
            const isHidden = hiddenCategories[m.category_id] || hiddenItems['m-' + m.id];
            const depth = itemMap.get('m-' + m.id)?.depth || 0;

            let marker;
            if (!m.hide_symbology) {
                const iconName = getLucideIconName(cat?.icon || 'MapPin');
                const markerDivIcon = L.divIcon({
                    className: 'symbology-marker-div-icon',
                    html: `<div class="symbology-badge marker-badge" style="background-color: ${color};">
                        <i data-lucide="${iconName}"></i>
                    </div>`,
                    iconSize: [36, 36],
                    iconAnchor: [18, 18],
                    popupAnchor: [0, -18]
                });

                marker = L.marker([m.latitude, m.longitude], {
                    icon: markerDivIcon,
                    zIndexOffset: 1000 + depth * 200
                });
            } else {
                marker = L.circleMarker([m.latitude, m.longitude], {
                    radius: 6,
                    fillColor: color,
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.95,
                    zIndexOffset: 1000 + depth * 200
                });
            }

            marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                if (mapMode === 'delete') {
                    deleteElement(m, 'marker');
                    return;
                }
                onElementClicked(m, 'marker', marker);
            });

            markerLayersMap.set(m.id, marker);

            // Zoom threshold (Solved Issue 1)
            let zoomHidden = false;
            if (cat?.min_zoom && currentZoom < cat.min_zoom) zoomHidden = true;
            if (cat?.max_zoom && currentZoom > cat.max_zoom) zoomHidden = true;

            if (!isHidden && !zoomHidden) {
                marker.addTo(map);
            }
        } catch (err) {
            console.error('Marker render error:', m, err);
        }
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Solved Issue 1: Zoom Threshold updates on zoomend
map.on('zoomend', () => {
    renderAllMapLayers();
});

// Map Click Listener
map.on('click', (e) => {
    if (isAdmin && mapMode === 'add-marker') {
        document.getElementById('marker-lat').value = e.latlng.lat.toFixed(6);
        document.getElementById('marker-lng').value = e.latlng.lng.toFixed(6);
        openAdminPanel('add-marker');
        showToast('Koordinatlar forma eklendi.', 'info');
        return;
    }

    selectedItem = null;
    document.getElementById('floating-details-btn')?.classList.remove('visible');
    closeRightPanel();
    renderTreeSidebar();
});

function deleteElement(item, type) {
    if (confirm(`"${item.name}" öğesini silmek istediğinize emin misiniz?`)) {
        if (type === 'marker') {
            campusData.markers = campusData.markers.filter(m => m.id !== item.id);
        } else {
            campusData.polygons = campusData.polygons.filter(p => p.id !== item.id);
        }
        saveDataToStorage();
        renderAllMapLayers();
        renderTreeSidebar();
        populateParentDropdowns();
        closeRightPanel();
        showToast(`"${item.name}" silindi.`, 'success');
    }
}

// -----------------------------------------------------------------------------
// 5. Element Click & Popup (Matching Screenshot 2 & 4 - Clean Popup)
// -----------------------------------------------------------------------------
function onElementClicked(item, type, layer) {
    selectedItem = { ...item, type };

    const cat = (campusData.categories || []).find(c => c.id === item.category_id);
    let popupHtml = `<div class="popup-inner-title">${item.name || 'İsimsiz'}</div>`;
    if (cat) popupHtml += `<div style="font-size:0.75rem; color:#64748b; margin-bottom:4px;">${cat.name}</div>`;

    if (isAdmin) {
        popupHtml += `<button class="popup-btn-edit" id="popup-edit-btn">Düzenle</button>`;
    } else {
        popupHtml += `<button class="popup-btn-edit" id="popup-detail-btn" style="background:#059669; margin-top:6px; cursor:pointer;">Detayları Gör &rarr;</button>`;
    }

    let popupLatLng = null;
    if (type === 'marker' && item.latitude && item.longitude) {
        popupLatLng = [item.latitude, item.longitude];
    } else if (layer && typeof layer.getBounds === 'function') {
        popupLatLng = layer.getBounds().getCenter();
    } else if (item.coordinates && item.coordinates[0] && item.coordinates[0][0]) {
        popupLatLng = [item.coordinates[0][0][1], item.coordinates[0][0][0]];
    }

    if (popupLatLng) {
        const popup = L.popup()
            .setLatLng(popupLatLng)
            .setContent(popupHtml)
            .openOn(map);

        setTimeout(() => {
            const editBtn = document.getElementById('popup-edit-btn');
            if (editBtn) {
                L.DomEvent.disableClickPropagation(editBtn);
                editBtn.addEventListener('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    map.closePopup();
                    editElement(item, type);
                });
            }

            const detailBtn = document.getElementById('popup-detail-btn');
            if (detailBtn) {
                L.DomEvent.disableClickPropagation(detailBtn);
                detailBtn.addEventListener('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    openVisitorDetails(selectedItem);
                });
            }
        }, 50);
    }

    const floatBtn = document.getElementById('floating-details-btn');
    if (floatBtn) {
        floatBtn.classList.add('visible');
    }

    // Automatically update visitor details if in visitor mode OR if right panel is already open!
    if (!isAdmin) {
        openVisitorDetails(selectedItem);
    } else {
        const rightPanel = document.getElementById('right-panel');
        if (rightPanel?.classList.contains('open') && document.getElementById('tab-content-visitor-details')?.style.display === 'block') {
            openVisitorDetails(selectedItem);
        }
    }

    renderTreeSidebar();
}

// -----------------------------------------------------------------------------
// 6. Tree Sidebar: "Katmanlar" with Nested Children Hierarchy (Matching Screenshot 2)
// -----------------------------------------------------------------------------
function renderTreeSidebar() {
    const container = document.getElementById('tree-container');
    if (!container || !campusData) return;
    container.innerHTML = '';

    const { rootCategories } = buildHierarchy();
    const query = searchQuery.trim().toLowerCase();

    function renderCategoryNode(catGroup, depth = 0, parentNodeKey = 'root') {
        const catNodeKey = `${parentNodeKey}_cat_${catGroup.id}`;
        let items = catGroup.items || [];

        if (query) {
            const qMatches = (it) => {
                const matchSelf = (it.name || '').toLowerCase().includes(query) || (it.description || '').toLowerCase().includes(query);
                const matchChildren = it.children && it.children.some(c => qMatches(c));
                return matchSelf || matchChildren;
            };
            items = items.filter(qMatches);
            if (items.length === 0) return null;
        }

        const isExpanded = query ? true : (expandedCategories[catNodeKey] !== undefined ? expandedCategories[catNodeKey] : true);
        const isCatHidden = !!hiddenCategories[catGroup.id];

        const groupEl = document.createElement('div');
        groupEl.className = 'cat-group';
        if (depth > 0) {
            groupEl.style.marginLeft = '0.5rem';
            groupEl.style.marginTop = '0.15rem';
        }

        const catRow = document.createElement('div');
        catRow.className = 'cat-row';
        catRow.innerHTML = `
            <div class="cat-left-info">
                <span class="cat-chevron ${isExpanded ? 'open' : ''}">
                    <i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i>
                </span>
                <span class="cat-icon-wrap" style="color: ${catGroup.color || '#3b82f6'};">
                    <i data-lucide="${getLucideIconName(catGroup.icon)}" style="width: 15px; height: 15px;"></i>
                </span>
                <span class="cat-title">${catGroup.name}</span>
            </div>
            <div class="cat-right-actions">
                <span class="cat-count-badge">${items.length}</span>
                <button class="icon-action-btn cat-eye-btn" title="${isCatHidden ? 'Katmanı Göster' : 'Katmanı Gizle'}">
                    <i data-lucide="${isCatHidden ? 'eye-off' : 'eye'}" style="width: 13px; height: 13px; color:${isCatHidden ? '#94a3b8' : '#059669'};"></i>
                </button>
            </div>
        `;

        catRow.querySelector('.cat-left-info').addEventListener('click', (e) => {
            e.stopPropagation();
            expandedCategories[catNodeKey] = !isExpanded;
            renderTreeSidebar();
        });

        catRow.querySelector('.cat-eye-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            hiddenCategories[catGroup.id] = !hiddenCategories[catGroup.id];
            renderAllMapLayers();
            renderTreeSidebar();
        });

        groupEl.appendChild(catRow);

        if (isExpanded) {
            const itemsList = document.createElement('div');
            itemsList.className = 'cat-items-list';
            if (depth > 0) {
                itemsList.style.marginLeft = '0.6rem';
            }

            items.forEach(it => {
                const itemEl = renderItemNode(it, depth);
                if (itemEl) itemsList.appendChild(itemEl);
            });

            groupEl.appendChild(itemsList);
        }

        return groupEl;
    }

    function renderItemNode(it, depth) {
        const isItemHidden = !!hiddenCategories[it.category_id] || !!hiddenItems[it.itemKey];
        const isSelected = selectedItem?.id === it.id && selectedItem?.type === it.type;
        const hasChildren = it.children && it.children.length > 0;
        const isItemExpanded = query ? true : (expandedItems[it.itemKey] !== undefined ? expandedItems[it.itemKey] : (hasChildren && depth === 0));

        const itemWrap = document.createElement('div');
        itemWrap.className = 'item-wrap-block';

        const itemRow = document.createElement('div');
        itemRow.className = `item-row ${isSelected ? 'selected' : ''} ${isItemHidden ? 'item-hidden' : ''}`;
        itemRow.id = `sidebar-item-${it.itemKey}`;

        const chevronHtml = hasChildren ? `
            <span class="item-chevron ${isItemExpanded ? 'open' : ''}" style="margin-right:2px; display:inline-flex; align-items:center;">
                <i data-lucide="chevron-right" style="width: 14px; height: 14px; color:#64748b;"></i>
            </span>
        ` : '';

        // NO parent badge! Children are placed under their parent as requested.
        itemRow.innerHTML = `
            <div class="item-click-target">
                ${chevronHtml}
                <span class="item-title-text" title="${it.name || 'İsimsiz'}">${it.name || 'İsimsiz Öğe'}</span>
            </div>
            <div class="item-actions">
                <button class="icon-action-btn item-focus-btn" title="Odaklan">
                    <i data-lucide="search" style="width: 13px; height: 13px;"></i>
                </button>
                <button class="icon-action-btn item-eye-btn" title="${isItemHidden ? 'Göster' : 'Gizle'}">
                    <i data-lucide="${isItemHidden ? 'eye-off' : 'eye'}" style="width: 13px; height: 13px; color:${isItemHidden ? '#94a3b8' : '#059669'};"></i>
                </button>
            </div>
        `;

        itemRow.querySelector('.item-click-target').addEventListener('click', (e) => {
            if (hasChildren && (e.target.closest('.item-chevron') || !isSelected)) {
                expandedItems[it.itemKey] = !isItemExpanded;
            }
            const layer = it.type === 'marker' ? markerLayersMap.get(it.id) : polygonLayersMap.get(it.id);
            onElementClicked(it, it.type, layer);
            if (layer) {
                zoomToElement(it, layer);
            }
        });

        itemRow.querySelector('.item-focus-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const layer = it.type === 'marker' ? markerLayersMap.get(it.id) : polygonLayersMap.get(it.id);
            if (layer) zoomToElement(it, layer);
        });

        itemRow.querySelector('.item-eye-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            hiddenItems[it.itemKey] = !hiddenItems[it.itemKey];
            renderAllMapLayers();
            renderTreeSidebar();
        });

        itemWrap.appendChild(itemRow);

        // Recursively render child categories underneath this parent item
        if (hasChildren && isItemExpanded) {
            const childContainer = document.createElement('div');
            childContainer.className = 'item-child-container';

            if (it.childCategories && it.childCategories.length > 0) {
                it.childCategories.forEach(childCat => {
                    const childCatEl = renderCategoryNode(childCat, depth + 1, it.itemKey);
                    if (childCatEl) childContainer.appendChild(childCatEl);
                });
            }
            itemWrap.appendChild(childContainer);
        }

        return itemWrap;
    }

    rootCategories.forEach(catGroup => {
        const catEl = renderCategoryNode(catGroup, 0, 'root');
        if (catEl) container.appendChild(catEl);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function zoomToElement(item, layer) {
    if (item.type === 'marker') {
        map.flyTo([item.latitude, item.longitude], 18, { duration: 1.2 });
    } else if (layer && typeof layer.getBounds === 'function') {
        map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 18, duration: 1.2 });
    }
}

// -----------------------------------------------------------------------------
// 7. Right Panel Logic: Admin Management OR Visitor Details
// -----------------------------------------------------------------------------
function openAdminPanel(tab = 'add-marker') {
    currentAdminTab = tab;
    const panel = document.getElementById('right-panel');
    const tabsBar = document.getElementById('admin-tabs-bar');
    const title = document.getElementById('right-panel-title');

    title.textContent = 'Yönetim Paneli';
    tabsBar.style.display = 'flex';
    panel.classList.add('open');

    document.querySelectorAll('.panel-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.getElementById('tab-content-marker').style.display = tab === 'add-marker' ? 'block' : 'none';
    document.getElementById('tab-content-polygon').style.display = tab === 'add-polygon' ? 'block' : 'none';
    document.getElementById('tab-content-backup').style.display = tab === 'backup' ? 'block' : 'none';
    document.getElementById('tab-content-visitor-details').style.display = 'none';
}

function openVisitorDetails(item) {
    if (!item) return;
    selectedItem = { ...item };
    const panel = document.getElementById('right-panel');
    const tabsBar = document.getElementById('admin-tabs-bar');
    const title = document.getElementById('right-panel-title');
    const container = document.getElementById('visitor-details-container');

    if (!panel || !container) return;

    title.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="color:#059669; font-size:1.05rem; font-weight:700;">Detaylar</span>
            <span style="font-size:0.8rem; font-weight:600; color:#64748b; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.name || 'İsimsiz Öğe'}</span>
        </div>
    `;
    if (tabsBar) tabsBar.style.display = 'none';
    panel.classList.add('open');

    const tabMarker = document.getElementById('tab-content-marker');
    const tabPoly = document.getElementById('tab-content-polygon');
    const tabBackup = document.getElementById('tab-content-backup');
    const tabDetails = document.getElementById('tab-content-visitor-details');

    if (tabMarker) tabMarker.style.display = 'none';
    if (tabPoly) tabPoly.style.display = 'none';
    if (tabBackup) tabBackup.style.display = 'none';
    if (tabDetails) tabDetails.style.display = 'block';

    const cat = (campusData.categories || []).find(c => c.id === item.category_id);

    let parentInfoHtml = '';
    if (item.parent_id) {
        const parentObj = (campusData.polygons || []).find(p => p.id === item.parent_id) || (campusData.markers || []).find(m => m.id === item.parent_id);
        if (parentObj) {
            parentInfoHtml = `
                <div class="visitor-detail-section" style="margin-top: 0.85rem;">
                    <div class="visitor-detail-label">Bağlı Olduğu Ebeveyn</div>
                    <div class="visitor-detail-val" style="color:#059669; font-weight:600;">
                        ${parentObj.name}
                    </div>
                </div>
            `;
        }
    }

    const descHtml = item.description 
        ? item.description.replace(/\n/g, '<br>') 
        : 'Açıklama belirtilmemiş.';

    const linkUrl = item.link || (item.name ? `https://www.google.com/search?q=${encodeURIComponent(item.name + ' Ankara')}` : null);
    const linkText = item.link_title || (item.link ? 'Detaylı Bilgi &rarr;' : 'Google\'da Ara &rarr;');

    let imagesHtml = '';
    const imagesList = Array.isArray(item.images) && item.images.length > 0 ? item.images : ['Public/HBV_Foto.jpeg'];
    imagesHtml = `
        <div class="visitor-detail-section" style="margin-top: 1rem;">
            <div class="visitor-detail-label">Fotoğraflar</div>
            <div style="display:flex; flex-direction:column; gap:0.65rem; margin-top:0.4rem;">
                ${imagesList.map(img => `
                    <div style="border-radius:10px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                        <img src="${img}" alt="${item.name || 'Fotoğraf'}" onerror="this.onerror=null; this.src='Public/HBV_Foto.jpeg';" style="width:100%; height:auto; max-height:240px; object-fit:cover; display:block;">
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    container.innerHTML = `
        <div style="margin-bottom: 0.85rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <span class="badge-tag" style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; font-weight:600;">
                ${cat?.name || 'Genel'}
            </span>
            <span style="font-size:0.75rem; color:#94a3b8;">
                ${item.type === 'marker' ? 'Nokta / Konum' : 'Alan / Poligon'}
            </span>
        </div>

        <div class="visitor-detail-section">
            <div class="visitor-detail-label">Açıklama</div>
            <div class="visitor-detail-val" style="line-height:1.6;">${descHtml}</div>
        </div>

        ${parentInfoHtml}

        <div class="visitor-detail-section" style="margin-top: 0.85rem;">
            <div class="visitor-detail-label">Bağlantılar</div>
            <div class="visitor-detail-val">
                <a href="${linkUrl}" target="_blank" rel="noopener noreferrer" style="color:#059669; font-weight:600; text-decoration:underline;">
                    ${linkText}
                </a>
            </div>
        </div>

        ${imagesHtml}
    `;

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function closeRightPanel() {
    document.getElementById('right-panel')?.classList.remove('open');
}

const closePanelBtn = document.getElementById('close-right-panel-btn');
if (closePanelBtn) {
    L.DomEvent.disableClickPropagation(closePanelBtn);
    closePanelBtn.addEventListener('click', (e) => {
        L.DomEvent.stopPropagation(e);
        closeRightPanel();
    });
}
document.getElementById('marker-cancel-btn')?.addEventListener('click', closeRightPanel);
document.getElementById('polygon-cancel-btn')?.addEventListener('click', closeRightPanel);

const floatDetailsBtn = document.getElementById('floating-details-btn');
if (floatDetailsBtn) {
    L.DomEvent.disableClickPropagation(floatDetailsBtn);
    L.DomEvent.disableScrollPropagation(floatDetailsBtn);
    floatDetailsBtn.addEventListener('click', (e) => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        if (!selectedItem && campusData?.polygons?.length > 0) {
            selectedItem = { ...campusData.polygons[0], type: 'polygon' };
        }
        if (selectedItem) {
            openVisitorDetails(selectedItem);
        } else {
            showToast('Lütfen önce haritadan veya listeden bir öğe seçin.', 'info');
        }
    });
}

const rightPanelEl = document.getElementById('right-panel');
if (rightPanelEl) {
    L.DomEvent.disableClickPropagation(rightPanelEl);
    L.DomEvent.disableScrollPropagation(rightPanelEl);
}

document.querySelectorAll('.panel-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        openAdminPanel(btn.dataset.tab);
    });
});

// -----------------------------------------------------------------------------
// 8. Admin Edit Element Handler
// -----------------------------------------------------------------------------
function editElement(item, type) {
    activeFormImages = Array.isArray(item.images) ? [...item.images] : [];

    if (type === 'marker') {
        document.getElementById('editing-marker-id').value = item.id;
        document.getElementById('marker-name').value = item.name || '';
        document.getElementById('marker-category').value = item.category_id || '';
        document.getElementById('marker-lat').value = item.latitude || '';
        document.getElementById('marker-lng').value = item.longitude || '';
        document.getElementById('marker-desc').value = item.description || '';
        document.getElementById('marker-hide-symbology').checked = !!item.hide_symbology;
        document.getElementById('marker-parent').value = item.parent_id || '';
        renderImagePreviews('marker-images-preview');
        openAdminPanel('add-marker');
    } else {
        document.getElementById('editing-polygon-id').value = item.id;
        document.getElementById('polygon-name').value = item.name || '';
        document.getElementById('polygon-category').value = item.category_id || '';
        document.getElementById('polygon-desc').value = item.description || '';
        document.getElementById('polygon-hide-symbology').checked = !!item.hide_symbology;
        document.getElementById('polygon-parent').value = item.parent_id || '';
        renderImagePreviews('polygon-images-preview');
        openAdminPanel('add-polygon');
    }
}

// Image File Input Handlers
function setupImageUpload(inputId, previewId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                activeFormImages.push(evt.target.result);
                renderImagePreviews(previewId);
            };
            reader.readAsDataURL(file);
        });
        input.value = '';
    });
}

function renderImagePreviews(previewId) {
    const previewContainer = document.getElementById(previewId);
    if (!previewContainer) return;

    previewContainer.innerHTML = '';
    activeFormImages.forEach((imgSrc, idx) => {
        const thumb = document.createElement('div');
        thumb.className = 'image-preview-thumb-box';
        thumb.innerHTML = `
            <img src="${imgSrc}" alt="Foto">
            <button type="button" class="remove-img-btn" title="Sil">&times;</button>
        `;
        thumb.querySelector('.remove-img-btn').addEventListener('click', () => {
            activeFormImages.splice(idx, 1);
            renderImagePreviews(previewId);
        });
        previewContainer.appendChild(thumb);
    });
}

setupImageUpload('marker-image-input', 'marker-images-preview');
setupImageUpload('polygon-image-input', 'polygon-images-preview');

// Marker Form Submit
document.getElementById('marker-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('editing-marker-id').value;
    const name = document.getElementById('marker-name').value.trim();
    const category_id = parseInt(document.getElementById('marker-category').value);
    const latitude = parseFloat(document.getElementById('marker-lat').value);
    const longitude = parseFloat(document.getElementById('marker-lng').value);
    const description = document.getElementById('marker-desc').value;
    const hide_symbology = document.getElementById('marker-hide-symbology').checked;
    const parentVal = document.getElementById('marker-parent').value;
    const parent_id = parentVal ? parseInt(parentVal) : null;

    if (editId) {
        const m = campusData.markers.find(it => it.id === parseInt(editId));
        if (m) {
            m.name = name;
            m.category_id = category_id;
            m.latitude = latitude;
            m.longitude = longitude;
            m.description = description;
            m.hide_symbology = hide_symbology;
            m.parent_id = parent_id;
            m.images = [...activeFormImages];
        }
        showToast(`"${name}" güncellendi.`, 'success');
    } else {
        const newMarker = {
            id: Date.now(),
            name,
            category_id,
            latitude,
            longitude,
            description,
            hide_symbology,
            parent_id,
            images: [...activeFormImages]
        };
        campusData.markers.push(newMarker);
        showToast(`"${name}" başarıyla oluşturuldu.`, 'success');
    }

    saveDataToStorage();
    renderAllMapLayers();
    renderTreeSidebar();
    populateParentDropdowns();
    closeRightPanel();
    document.getElementById('marker-form').reset();
    document.getElementById('editing-marker-id').value = '';
    activeFormImages = [];
    renderImagePreviews('marker-images-preview');
});

// Polygon Form Submit
document.getElementById('polygon-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('editing-polygon-id').value;
    const name = document.getElementById('polygon-name').value.trim();
    const category_id = parseInt(document.getElementById('polygon-category').value);
    const description = document.getElementById('polygon-desc').value;
    const hide_symbology = document.getElementById('polygon-hide-symbology').checked;
    const parentVal = document.getElementById('polygon-parent').value;
    const parent_id = parentVal ? parseInt(parentVal) : null;

    if (editId) {
        const p = campusData.polygons.find(it => it.id === parseInt(editId));
        if (p) {
            p.name = name;
            p.category_id = category_id;
            p.description = description;
            p.hide_symbology = hide_symbology;
            p.parent_id = parent_id;
            p.images = [...activeFormImages];
        }
        showToast(`"${name}" güncellendi.`, 'success');
    } else {
        showToast('Lütfen sol araç çubuğundaki Poligon aracıyla harita üzerinde çizim yapın.', 'info');
        return;
    }

    saveDataToStorage();
    renderAllMapLayers();
    renderTreeSidebar();
    populateParentDropdowns();
    closeRightPanel();
    document.getElementById('polygon-form').reset();
    document.getElementById('editing-polygon-id').value = '';
    activeFormImages = [];
    renderImagePreviews('polygon-images-preview');
});

function populateCategoryDropdowns() {
    const markerSelect = document.getElementById('marker-category');
    const polySelect = document.getElementById('polygon-category');
    if (!markerSelect || !polySelect) return;

    markerSelect.innerHTML = '<option value="">Seçiniz...</option>';
    polySelect.innerHTML = '<option value="">Seçiniz...</option>';

    (campusData.categories || []).forEach(cat => {
        const opt1 = document.createElement('option');
        opt1.value = cat.id;
        opt1.textContent = cat.name;
        markerSelect.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = cat.id;
        opt2.textContent = cat.name;
        polySelect.appendChild(opt2);
    });
}

function populateParentDropdowns() {
    const mParent = document.getElementById('marker-parent');
    const pParent = document.getElementById('polygon-parent');
    if (!mParent && !pParent) return;

    const baseHtml = '<option value="">Yok (Kök Element)</option>';
    if (mParent) mParent.innerHTML = baseHtml;
    if (pParent) pParent.innerHTML = baseHtml;

    // Polygons as potential parents (campuses, main facilities)
    (campusData.polygons || []).forEach(p => {
        const opt1 = document.createElement('option');
        opt1.value = p.id;
        opt1.textContent = `[Alan] ${p.name}`;
        if (mParent) mParent.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = p.id;
        opt2.textContent = `[Alan] ${p.name}`;
        if (pParent) pParent.appendChild(opt2);
    });
}

// -----------------------------------------------------------------------------
// 9. Vertical Floating Map Tools (Admin Drawing Toolbar - Screenshot 1 & 2)
// -----------------------------------------------------------------------------
function setMapMode(mode) {
    mapMode = mode;
    document.querySelectorAll('.map-tool-btn').forEach(btn => btn.classList.remove('active'));

    if (mode === 'pan') {
        document.getElementById('tool-pan')?.classList.add('active');
        map.pm.disableDraw();
        map.pm.disableGlobalRemovalMode();
    } else if (mode === 'add-marker') {
        document.getElementById('tool-add-marker')?.classList.add('active');
        map.pm.disableDraw();
        map.pm.disableGlobalRemovalMode();
        openAdminPanel('add-marker');
        showToast('Marker eklemek için haritada bir konuma tıklayın.', 'info');
    } else if (mode === 'add-linestring') {
        document.getElementById('tool-add-linestring')?.classList.add('active');
        openAdminPanel('add-polygon');
        map.pm.enableDraw('Line');
    } else if (mode === 'add-polygon') {
        document.getElementById('tool-add-polygon')?.classList.add('active');
        openAdminPanel('add-polygon');
        map.pm.enableDraw('Polygon');
    } else if (mode === 'delete') {
        document.getElementById('tool-delete')?.classList.add('active');
        map.pm.enableGlobalRemovalMode();
        showToast('Silmek istediğiniz nesneye tıklayın.', 'info');
    }
}

document.getElementById('tool-pan')?.addEventListener('click', () => setMapMode('pan'));
document.getElementById('tool-add-marker')?.addEventListener('click', () => setMapMode('add-marker'));
document.getElementById('tool-add-linestring')?.addEventListener('click', () => setMapMode('add-linestring'));
document.getElementById('tool-add-polygon')?.addEventListener('click', () => setMapMode('add-polygon'));
document.getElementById('tool-delete')?.addEventListener('click', () => setMapMode('delete'));

// Geoman Events for Drawing Polygons
map.on('pm:create', (e) => {
    const layer = e.layer;
    const name = prompt('Yeni şekil için bir isim girin:', 'Yeni Kampüs Alanı');
    if (!name) {
        map.removeLayer(layer);
        setMapMode('pan');
        return;
    }

    const defaultCat = (campusData.categories && campusData.categories[0]) ? campusData.categories[0].id : 18;
    const geojson = layer.toGeoJSON().geometry;

    const newPolygon = {
        id: Date.now(),
        name,
        category_id: defaultCat,
        geojson: JSON.stringify(geojson),
        description: 'Harita üzerinde yeni çizildi.',
        images: []
    };

    campusData.polygons.push(newPolygon);
    saveDataToStorage();
    map.removeLayer(layer);
    renderAllMapLayers();
    renderTreeSidebar();
    populateParentDropdowns();
    setMapMode('pan');
    showToast(`"${name}" kaydedildi!`, 'success');
});

// -----------------------------------------------------------------------------
// 10. Admin Authentication Toggle
// -----------------------------------------------------------------------------
const authBtn = document.getElementById('auth-btn');
const adminStatusBadge = document.getElementById('admin-status-badge');
const verticalToolbar = document.getElementById('map-vertical-toolbar');
const loginModal = document.getElementById('login-modal');

function updateAdminUI() {
    if (isAdmin) {
        adminStatusBadge.textContent = 'Admin';
        adminStatusBadge.style.background = '#05966920';
        adminStatusBadge.style.color = '#059669';
        adminStatusBadge.style.borderColor = '#05966950';

        authBtn.textContent = 'Çıkış Yap';
        authBtn.className = 'btn btn-danger btn-sm';

        verticalToolbar.style.display = 'flex';
        setMapMode('pan');
    } else {
        adminStatusBadge.textContent = 'Ziyaretçi Modu';
        adminStatusBadge.style.background = '#e0e7ff';
        adminStatusBadge.style.color = '#4338ca';
        adminStatusBadge.style.borderColor = '#c7d2fe';

        authBtn.textContent = 'Giriş Yap';
        authBtn.className = 'btn btn-outline btn-sm';

        verticalToolbar.style.display = 'none';
        map.pm?.disableDraw?.();
        map.pm?.disableGlobalRemovalMode?.();
        closeRightPanel();
    }
}

authBtn?.addEventListener('click', () => {
    if (isAdmin) {
        isAdmin = false;
        sessionStorage.removeItem('webgis_is_admin');
        updateAdminUI();
        showToast('Oturum kapatıldı.');
    } else {
        loginModal?.classList.add('open');
    }
});

document.getElementById('modal-close-btn')?.addEventListener('click', () => loginModal?.classList.remove('open'));
document.getElementById('modal-cancel-btn')?.addEventListener('click', () => loginModal?.classList.remove('open'));

document.getElementById('modal-submit-btn')?.addEventListener('click', () => {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value.trim();
    const err = document.getElementById('login-error-msg');

    if (email === ADMIN_EMAIL && pass === ADMIN_PASS) {
        isAdmin = true;
        sessionStorage.setItem('webgis_is_admin', 'true');
        loginModal?.classList.remove('open');
        err.style.display = 'none';
        updateAdminUI();
        showToast('Yönetici girişi başarılı! Marker Yönetim araçları aktif.', 'success');
    } else {
        err.style.display = 'block';
    }
});

// -----------------------------------------------------------------------------
// 11. Backup / GeoJSON Export & Import (Matching Screenshot 1)
// -----------------------------------------------------------------------------
document.getElementById('backup-export-btn')?.addEventListener('click', () => {
    const exportFeatures = [];

    (campusData.polygons || []).forEach(p => {
        try {
            const geom = typeof p.geojson === 'string' ? JSON.parse(p.geojson) : p.geojson;
            const cat = (campusData.categories || []).find(c => c.id === p.category_id);
            exportFeatures.push({
                type: 'Feature',
                id: 'p-' + p.id,
                geometry: geom,
                properties: {
                    name: p.name,
                    description: p.description,
                    category: cat?.name || 'Diğer',
                    parent_id: p.parent_id,
                    images: p.images
                }
            });
        } catch {}
    });

    (campusData.markers || []).forEach(m => {
        const cat = (campusData.categories || []).find(c => c.id === m.category_id);
        exportFeatures.push({
            type: 'Feature',
            id: 'm-' + m.id,
            geometry: {
                type: 'Point',
                coordinates: [m.longitude, m.latitude]
            },
            properties: {
                name: m.name,
                description: m.description,
                category: cat?.name || 'Diğer',
                parent_id: m.parent_id,
                images: m.images
            }
        });
    });

    const exportGeoJson = {
        type: 'FeatureCollection',
        categories: campusData.categories,
        features: exportFeatures
    };

    const blob = new Blob([JSON.stringify(exportGeoJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'campus-data.geojson';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Tüm veriler GeoJSON olarak indirildi!', 'success');
});

document.getElementById('backup-import-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            if (imported.features && Array.isArray(imported.features)) {
                imported.features.forEach(f => {
                    if (f.geometry.type === 'Point') {
                        campusData.markers.push({
                            id: Date.now() + Math.random(),
                            name: f.properties?.name || 'İçe Aktarılan Nokta',
                            category_id: (campusData.categories[0] || {}).id || 1,
                            latitude: f.geometry.coordinates[1],
                            longitude: f.geometry.coordinates[0],
                            description: f.properties?.description || '',
                            parent_id: f.properties?.parent_id || null,
                            images: f.properties?.images || []
                        });
                    } else if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
                        campusData.polygons.push({
                            id: Date.now() + Math.random(),
                            name: f.properties?.name || 'İçe Aktarılan Şekil',
                            category_id: (campusData.categories[0] || {}).id || 1,
                            geojson: JSON.stringify(f.geometry),
                            description: f.properties?.description || '',
                            parent_id: f.properties?.parent_id || null,
                            images: f.properties?.images || []
                        });
                    }
                });

                saveDataToStorage();
                renderAllMapLayers();
                renderTreeSidebar();
                populateParentDropdowns();
                showToast('GeoJSON verileri başarıyla içeri aktarıldı!', 'success');
            }
        } catch {
            alert('Geçersiz GeoJSON dosyası!');
        }
    };
    reader.readAsText(file);
});

document.getElementById('backup-reset-btn')?.addEventListener('click', () => {
    if (confirm('Tüm çizimler sıfırlanacak ve veritabanı yedeğindeki orijinal verilere dönülecektir. Emin misiniz?')) {
        localStorage.removeItem(STORAGE_KEY);
        loadCampusData();
        showToast('Veriler sıfırlandı.', 'info');
    }
});

// Base Layer Switcher
document.getElementById('btn-layer-hybrid')?.addEventListener('click', () => {
    if (currentBaseLayer !== hybridTileLayer) {
        map.removeLayer(currentBaseLayer);
        hybridTileLayer.addTo(map);
        currentBaseLayer = hybridTileLayer;
        document.getElementById('btn-layer-hybrid').className = 'btn btn-sm btn-emerald';
        document.getElementById('btn-layer-osm').className = 'btn btn-sm btn-outline';
    }
});

document.getElementById('btn-layer-osm')?.addEventListener('click', () => {
    if (currentBaseLayer !== osmTileLayer) {
        map.removeLayer(currentBaseLayer);
        osmTileLayer.addTo(map);
        currentBaseLayer = osmTileLayer;
        document.getElementById('btn-layer-osm').className = 'btn btn-sm btn-emerald';
        document.getElementById('btn-layer-hybrid').className = 'btn btn-sm btn-outline';
    }
});

// Sidebar Toggle
document.getElementById('toggle-sidebar-btn')?.addEventListener('click', () => {
    document.getElementById('left-sidebar')?.classList.toggle('open');
});
document.getElementById('close-left-sidebar-btn')?.addEventListener('click', () => {
    document.getElementById('left-sidebar')?.classList.remove('open');
});

// Search Filter
document.getElementById('map-search-input')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    document.getElementById('clear-search-btn').style.display = searchQuery ? 'block' : 'none';
    renderTreeSidebar();
});
document.getElementById('clear-search-btn')?.addEventListener('click', () => {
    searchQuery = '';
    document.getElementById('map-search-input').value = '';
    document.getElementById('clear-search-btn').style.display = 'none';
    renderTreeSidebar();
});

// -----------------------------------------------------------------------------
// 12. Boot
// -----------------------------------------------------------------------------
loadCampusData();
updateAdminUI();