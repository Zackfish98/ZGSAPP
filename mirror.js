import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const root = document.getElementById('scene-root');
const popup = document.getElementById('precedent-popup');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2b2d);
scene.fog = new THREE.Fog(0x1a1b1d, 6, 14);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 100);
camera.rotation.order = 'YXZ';
camera.position.set(0, 1.3, 1.6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);

// Soft image-based lighting (studio-render look) instead of flat ambient
// hacks -- this is what makes matte/metal surfaces read as physically real
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const overhead = new THREE.SpotLight(0xf5f2e8, 60, 10, Math.PI / 3.2, 0.6, 1);
overhead.position.set(0, 3.4, 0.6);
overhead.target.position.set(0, 1.2, -1);
overhead.castShadow = true;
overhead.shadow.mapSize.set(1024, 1024);
overhead.shadow.radius = 4;
scene.add(overhead, overhead.target);

// Room: a single enclosed shell (walls + ceiling + floor) so the mirror
// has something to actually reflect instead of empty void
const wallZ = -2.4;
const backZ = 3;
const roomDepth = backZ - wallZ;
const roomHeight = 4;
const roomWidth = 6;

const shell = new THREE.Mesh(
  new THREE.BoxGeometry(roomWidth, roomHeight, roomDepth),
  new THREE.MeshStandardMaterial({ color: 0x7a7c80, roughness: 0.9, metalness: 0, side: THREE.BackSide })
);
shell.position.set(0, roomHeight / 2, (wallZ + backZ) / 2);
shell.receiveShadow = true;
scene.add(shell);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(roomWidth, roomDepth),
  new THREE.MeshStandardMaterial({ color: 0x2a2b2c, roughness: 0.55, metalness: 0 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0.01, (wallZ + backZ) / 2);
floor.receiveShadow = true;
scene.add(floor);

// Two-way mirror set into the wall
const mirrorWidth = 1.7;
const mirrorHeight = 1.05;

const frame = new THREE.Mesh(
  new THREE.PlaneGeometry(mirrorWidth + 0.14, mirrorHeight + 0.14),
  new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.35, metalness: 0.7 })
);
frame.position.set(0, 1.55, wallZ + 0.01);
scene.add(frame);

const mirror = new Reflector(new THREE.PlaneGeometry(mirrorWidth, mirrorHeight), {
  clipBias: 0.003,
  textureWidth: window.innerWidth * window.devicePixelRatio,
  textureHeight: window.innerHeight * window.devicePixelRatio,
  color: 0x8a8d90,
});
mirror.position.set(0, 1.55, wallZ + 0.03);
scene.add(mirror);

// Watchers glimpsed through the two-way mirror -- hidden until the cursor
// lingers over the top-left or top-right of the glass.
function createSilhouetteTexture() {
  const w = 300;
  const h = 400;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const drawFigure = (cx, scale) => {
    ctx.save();
    ctx.translate(cx, h * 0.92);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(8, 8, 10, 0.8)';
    // legs
    ctx.fillRect(-34, -150, 26, 150);
    ctx.fillRect(8, -150, 26, 150);
    // torso (suit jacket, tapered)
    ctx.beginPath();
    ctx.moveTo(-46, -150);
    ctx.lineTo(46, -150);
    ctx.lineTo(38, -290);
    ctx.lineTo(-38, -290);
    ctx.closePath();
    ctx.fill();
    // shoulders
    ctx.beginPath();
    ctx.moveTo(-38, -290);
    ctx.lineTo(38, -290);
    ctx.lineTo(30, -320);
    ctx.lineTo(-30, -320);
    ctx.closePath();
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.arc(0, -345, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  drawFigure(w * 0.36, 0.62);
  drawFigure(w * 0.66, 0.72);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const silhouetteTexture = createSilhouetteTexture();
const silhouetteGeometry = new THREE.PlaneGeometry(0.55, 0.73);

function createSilhouette(sign) {
  const material = new THREE.MeshBasicMaterial({
    map: silhouetteTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(silhouetteGeometry, material);
  mesh.position.set(sign * mirrorWidth * 0.4, 1.55 + mirrorHeight * 0.16, wallZ + 0.032);
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, material, hoverAmount: 0 };
}

const mirrorSilhouettes = {
  left: createSilhouette(-1),
  right: createSilhouette(1),
};
// Timing for the automatic reveal cycle: first appearance shortly after
// load, then repeating roughly once a minute.
const SILHOUETTE_DELAY_S = 4;
const SILHOUETTE_VISIBLE_S = 5;
const SILHOUETTE_INTERVAL_S = 60;

// Desk: a permanent fixture (not something that fades in). Matte brown top
// on thin metal legs, built as a group purely for convenient positioning.
const desk = new THREE.Group();
desk.position.set(0, 0, 0.55);

const deskTopHeight = 0.74;
const deskTopThickness = 0.06;
const deskWidth = 1.5;
const deskDepth = 0.9;

const deskTopMaterial = new THREE.MeshStandardMaterial({ color: 0x3a332c, roughness: 0.75, metalness: 0 });
const deskTop = new THREE.Mesh(new THREE.BoxGeometry(deskWidth, deskTopThickness, deskDepth), deskTopMaterial);
deskTop.position.set(0, deskTopHeight, 0);
deskTop.castShadow = true;
deskTop.receiveShadow = true;
desk.add(deskTop);

const legMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaae, roughness: 0.3, metalness: 0.85 });
const legHeight = deskTopHeight - deskTopThickness / 2;
const legGeometry = new THREE.CylinderGeometry(0.025, 0.025, legHeight, 12);
const legInsetX = deskWidth / 2 - 0.08;
const legInsetZ = deskDepth / 2 - 0.08;
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(sx * legInsetX, legHeight / 2, sz * legInsetZ);
    leg.castShadow = true;
    leg.receiveShadow = true;
    desk.add(leg);
  }
}

scene.add(desk);

// Manila folders on the desk. Each is a back panel (holding the sheet and
// tabs) plus a front cover that hinges open along the left edge. Built
// natively in portrait: width (X, hinge-to-tab span) is the short side,
// depth (Z, where tabs cascade) is the long side.
const folderWidth = 0.22;
const folderThickness = 0.012;
const folderDepth = 0.34;
const FOLDER_OPEN_ANGLE = 2.2;

const backPanelGeometry = new THREE.BoxGeometry(folderWidth, folderThickness, folderDepth);

// Front cover geometry is shifted so its local origin sits at the hinge
// (the folder's left edge) instead of its own center.
const frontPanelGeometry = new THREE.BoxGeometry(folderWidth, folderThickness, folderDepth);
frontPanelGeometry.translate(folderWidth / 2, 0, 0);

// Renders a folder's name onto a square canvas so it can be used as a
// sticky-note texture (auto-shrinks the font to fit).
function createStickyNoteTexture(text) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f5da5c';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#2a2a2a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxWidth = size - 36;
  let fontSize = 48;
  do {
    ctx.font = `bold ${fontSize}px "Segoe Print", "Comic Sans MS", sans-serif`;
    fontSize -= 2;
  } while (ctx.measureText(text).width > maxWidth && fontSize > 16);
  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Word-wraps text onto a 2D canvas context, returning the y of the last
// line drawn (so callers can stack more content below it).
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let curY = y;
  for (const word of words) {
    const test = `${line}${word} `;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, curY);
      line = `${word} `;
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, curY);
  return curY;
}

// Renders a section's title + body onto the sheet inside an opened folder.
function createSheetTexture(title, body) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f7f4ec';
  ctx.fillRect(0, 0, size, size);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2a2a2a';
  ctx.font = 'bold 30px "Courier New", monospace';
  const titleEndY = wrapText(ctx, title.toUpperCase(), 34, 56, size - 68, 36);

  ctx.strokeStyle = '#c9c4b4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(34, titleEndY + 22);
  ctx.lineTo(size - 34, titleEndY + 22);
  ctx.stroke();

  ctx.font = '20px "Courier New", monospace';
  ctx.fillStyle = '#1c1c1c';
  wrapText(ctx, body, 34, titleEndY + 58, size - 68, 28);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const stickyNoteGeometry = new THREE.PlaneGeometry(0.133, 0.133);
stickyNoteGeometry.rotateX(-Math.PI / 2);

const sheetGeometry = new THREE.PlaneGeometry(folderWidth * 0.92, folderDepth * 0.82);
sheetGeometry.rotateX(-Math.PI / 2);

// Tabs are flat cards (like the sheet), not blocks -- they should read as
// thin paper dividers stacked behind the sheet, with only the outer "flag"
// sticking out past its edge, not as chunky 3D chips.
const tabGeometry = new THREE.PlaneGeometry(0.09, 0.032);
tabGeometry.rotateX(-Math.PI / 2);
const TAB_CENTER_X = 0.075;

const folderDefs = [
  {
    x: -0.32,
    rotationY: 0.08,
    stickyRotation: -0.09,
    label: 'Documentation',
    body: 'Research and analysis on prior work. Full write-up coming soon.',
    sections: [
      { label: 'Rhetorical Analysis', color: '#c96a5a' },
      {
        label: 'Ontological Analysis',
        color: '#5a8ac9',
        paragraphs: [
          'The project is an installation piece consisting of three screens positioned behind an opaquely metallic fabric. On the screens there are samples of microtask querying on emotional responses to images, 3D representations of emotional response and task to identify or explain objects.',
        ],
      },
      {
        label: 'Historical and Contextual Analysis',
        color: '#c9a35a',
        paragraphs: [
          'The piece, produced in 2020 was at a time when "intelligent" models that can understand the nuances of the world were only beginning to appear in public discourse.',
          'To many, representations of human emotion like in animated characters or chatbots are seen as novel but ultimately clunky in their representation of emotion. In order to improve on algorithms’ emotional understanding, large datasets must be improved through a manual process of "cleaning." Companies producing these algorithms discovered that the most efficient way to "clean" large datasets is to outsource this work to low wage workers, primarily in the Global South. Elisa Papa wanted to highlight the unseen labor undertaken for developing artificial intelligence infrastructures.',
          'Particularly she wanted to highlight how the training of these datasets is rooted in the idea that emotions are universal- a flawed theory dating back to the 1900’s. On top of that their method of production is spread amongst parts of the world that might not even understand the nuances of expression by other cultures. This helps contribute to understanding how algorithms informed by human input can still have unclarities, just as people do. But this effect is compounded by the labor being spread across the diaspora of the Global South in search for cheap labor first, then the algorithm\'s quality.',
        ],
      },
      {
        label: 'Visual and Aesthetic Representation',
        color: '#6ac97a',
        images: ['images/visual-1.jpg', 'images/visual-2.jpg', 'images/visual-3.jpg'],
        paragraphs: [
          'The representation uses the fabric to create a physical separation between the observer and the work as a visual representation of the separation that exists between users of platforms that use these datasets and the labor it takes to produce them. That separation is expanded upon further by embroidered descriptions of facial micro-expressions produced by the algorithm. To signify the abstraction of how the algorithm interprets emotional input the artist uses untranslatable expressions from the artist native Sicilian tongue.',
          'On the other side the screen sits at the bottom of a tripod holding the structure of the fabric, similar in appearance to a portrait backdrop, a setup traditionally associated with capturing the character of an individual. The "back end" of the installation is intentionally placed in an untidy manner to express the feeling of being "behind a curtain."',
          'The screen then displays a sampling of the microtask the artist carried out to inform these algorithms of emotional input with the payment for the individual task. The task ranged from rating what emotion the image evokes to recording her own image to animate three dimensional characters.',
          'This installation follows a long line of works which are primarily in video format but use physical installation pieces to shape perspective and expand on the messages being explored through the video piece.',
        ],
      },
      { label: 'Discussion about Work', color: '#a25ac9' },
      { label: 'Archive', color: '#8a8a8a', href: 'archive.html' },
    ],
  },
];

const folders = folderDefs.map((def) => {
  const group = new THREE.Group();
  group.position.set(def.x, deskTopHeight + deskTopThickness / 2, 0.28);
  group.rotation.y = def.rotationY;
  desk.add(group);

  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0xddb28c, roughness: 0.8, metalness: 0 });

  const backPanel = new THREE.Mesh(backPanelGeometry, panelMaterial);
  backPanel.position.y = folderThickness / 2;
  backPanel.castShadow = true;
  backPanel.receiveShadow = true;
  group.add(backPanel);

  const sheetMaterial = new THREE.MeshStandardMaterial({
    map: createSheetTexture(def.label, def.body),
    roughness: 0.95,
    metalness: 0,
  });
  const sheet = new THREE.Mesh(sheetGeometry, sheetMaterial);
  sheet.position.set(-folderWidth * 0.02, folderThickness + 0.002, 0);
  sheet.receiveShadow = true;
  group.add(sheet);

  const sections = def.sections || [];
  const tabSpacing = sections.length > 1 ? (folderDepth * 0.75) / (sections.length - 1) : 0;
  const tabs = sections.map((section, i) => {
    const tabMaterial = new THREE.MeshStandardMaterial({ color: section.color, roughness: 0.55, metalness: 0 });
    const tabMesh = new THREE.Mesh(tabGeometry, tabMaterial);
    const zPos = sections.length > 1 ? -folderDepth * 0.375 + i * tabSpacing : 0;
    tabMesh.position.set(TAB_CENTER_X, folderThickness + 0.001, zPos);
    tabMesh.castShadow = true;
    group.add(tabMesh);
    return { mesh: tabMesh, section };
  });

  // Hinge sits at the folder's left edge; the front cover is its child so
  // rotating the hinge swings the cover open like a book.
  const hinge = new THREE.Object3D();
  hinge.position.set(-folderWidth / 2, folderThickness, 0);
  group.add(hinge);

  const frontPanel = new THREE.Mesh(frontPanelGeometry, panelMaterial);
  frontPanel.castShadow = true;
  frontPanel.receiveShadow = true;
  hinge.add(frontPanel);

  const stickyMaterial = new THREE.MeshStandardMaterial({
    map: createStickyNoteTexture(def.label),
    roughness: 0.9,
    metalness: 0,
  });
  const stickyNote = new THREE.Mesh(stickyNoteGeometry, stickyMaterial);
  stickyNote.position.set(folderWidth / 2, folderThickness / 2 + 0.002, 0);
  stickyNote.rotation.y = def.stickyRotation;
  stickyNote.castShadow = true;
  stickyNote.receiveShadow = true;
  frontPanel.add(stickyNote);

  return {
    type: 'folder',
    mesh: group,
    hinge,
    tabs,
    sheetMaterial,
    label: def.label,
    body: def.body,
    sections,
    hoverAmount: 0,
    openProgress: 0,
  };
});

// Retro chunky remote (replaces a second folder). Body + black button
// panel + a printed label plate, with two big raised buttons.
const remoteWidth = 0.16;
const remoteLength = 0.3;
const remoteThickness = 0.045;

const remoteBodyGeometry = new THREE.BoxGeometry(remoteWidth, remoteThickness, remoteLength);

const remotePanelGeometry = new THREE.PlaneGeometry(remoteWidth * 0.82, remoteLength * 0.5);
remotePanelGeometry.rotateX(-Math.PI / 2);

const remoteLabelGeometry = new THREE.PlaneGeometry(remoteWidth * 0.72, remoteLength * 0.2);
remoteLabelGeometry.rotateX(-Math.PI / 2);

const remoteButtonGeometry = new THREE.BoxGeometry(remoteWidth * 0.36, 0.022, remoteLength * 0.32);

// Plain printed nameplate, like a label engraved into the remote's plastic.
function createPlateTexture(text) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#e7e3d8';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#242424';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxWidth = size - 30;
  let fontSize = 42;
  do {
    ctx.font = `bold ${fontSize}px "Courier New", monospace`;
    fontSize -= 2;
  } while (ctx.measureText(text).width > maxWidth && fontSize > 14);
  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const remoteDef = {
  x: 0.32,
  rotationY: -0.06,
  label: 'Mini-task',
  buttons: [
    { label: 'Relational Diagram', color: '#e5e1d6', mirrorBody: 'Relational Diagram — content coming soon.' },
    { label: 'Wider Practice Similarities', color: '#e0973c', questionnaire: true },
  ],
};

const remote = (() => {
  const group = new THREE.Group();
  group.position.set(remoteDef.x, deskTopHeight + deskTopThickness / 2, 0.28);
  group.rotation.y = remoteDef.rotationY;
  desk.add(group);

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x144a80, roughness: 0.5, metalness: 0 });
  const body = new THREE.Mesh(remoteBodyGeometry, bodyMaterial);
  body.position.y = remoteThickness / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5, metalness: 0.1 });
  const panel = new THREE.Mesh(remotePanelGeometry, panelMaterial);
  panel.position.set(0, remoteThickness + 0.001, -0.06);
  group.add(panel);

  const labelMaterial = new THREE.MeshStandardMaterial({
    map: createPlateTexture(remoteDef.label),
    roughness: 0.6,
    metalness: 0,
  });
  const label = new THREE.Mesh(remoteLabelGeometry, labelMaterial);
  label.position.set(0, remoteThickness + 0.001, 0.1);
  group.add(label);

  const buttonXOffsets = [-0.034, 0.034];
  const buttons = remoteDef.buttons.map((btn, i) => {
    const material = new THREE.MeshStandardMaterial({ color: btn.color, roughness: 0.4, metalness: 0.15 });
    const mesh = new THREE.Mesh(remoteButtonGeometry, material);
    mesh.position.set(buttonXOffsets[i], remoteThickness + 0.011, -0.06);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return { mesh, section: btn };
  });

  return {
    type: 'remote',
    mesh: group,
    tabs: buttons,
    label: remoteDef.label,
    hoverAmount: 0,
    openProgress: 0,
  };
})();

const deskItems = [...folders, remote];

// A plane in front of the mirror that shows whatever content a remote
// button "casts" onto it -- hidden until a button is pressed.
function createMirrorContentTexture(title, body) {
  const w = 820;
  const h = 506;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f2efe6';
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#242424';
  ctx.font = 'bold 46px "Courier New", monospace';
  const titleEndY = wrapText(ctx, title.toUpperCase(), 50, 90, w - 100, 54);

  ctx.strokeStyle = '#c9c4b4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(50, titleEndY + 30);
  ctx.lineTo(w - 50, titleEndY + 30);
  ctx.stroke();

  ctx.font = '30px "Courier New", monospace';
  ctx.fillStyle = '#1c1c1c';
  wrapText(ctx, body, 50, titleEndY + 80, w - 100, 40);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const mirrorContentMaterial = new THREE.MeshBasicMaterial();
const mirrorContentPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(mirrorWidth * 0.94, mirrorHeight * 0.9),
  mirrorContentMaterial
);
mirrorContentPlane.position.set(0, 1.57, wallZ + 0.035);
mirrorContentPlane.visible = false;
scene.add(mirrorContentPlane);

const mirrorViewPosition = new THREE.Vector3(0, 1.55, -0.9);
const mirrorLookTarget = new THREE.Vector3(0, 1.55, wallZ + 0.03);

// Mini-task questionnaire cast onto the mirror by the "Wider Practice
// Similarities" remote button. A linear 3-step wizard: intro, then two
// question steps that each collect a response, show a fixed "insight"
// reflection, and generate a deliberately dumb, exaggerated "AI summary"
// of the two texts before letting you move on.
const quizSteps = [
  {
    id: 'intro',
    heading: 'Intro',
    question:
      'Cleaning of Emotional Data is the last of a 3 part series the artist carried out. In this series she investigates the topic of Care, Labor and Automation. The following is a Mini-task to better understand how the projects are related.',
    type: 'intro',
  },
  {
    id: 'technologies-of-care',
    heading: 'Technologies of Care',
    question:
      "Listen to the video. How is this similar to the artist's existing work of Cleaning Emotional Data? If you have not familiarized yourself with the work, please do so in the documentation.",
    type: 'question',
    insight:
      'When thinking about what makes a person feel close or loved by another, is it the individual acts of love and care, or is it the trust and relation with the person just as much a part of what makes the acts of love feel "real?" Elisa shows how separating the context in which emotional acts and feelings emerge corrupts its emotional value in both pieces. In this piece the bot is using common phrases which are labeled as emotional triggers to establish a relationship with the user. As you heard, the bot is jumping the gun. It sounds unnatural, but to the algorithm it is simply following the basic instructions of how to establish connection: say the nice things, tell them you’re thinking of them, tell them you’re hurt, etc. This relates to the precedent work because similarly, the algorithms are isolating emotion as a series of individual actions, not holding it within the broader context.',
  },
  {
    id: 'labor-of-sleep',
    heading: 'Labor of Sleep',
    question:
      'Listen to the video. What data extraction do you think the artist is being critical of here? How does this piece relate to the Cleaning Emotional Data work?',
    type: 'question',
    insight:
      'Elisa is highlighting how sleep and biological data have become a new frontier of sorts for extraction. Often the extraction method is masked to be seen as "self improvement." Here she switches the view to the algorithm’s perspective — what it’s listening to, and what it’s interested in. Sleep has been seen as one of our most private activities. It’s something that even we see as a mystery. This represents how tech has not just intruded on one of the more intimate portions of our lives but turned the act of sleeping into a labor itself. We consent to this out of an attempt to "optimize" our lives. But is optimization just another method to get us to extract more of ourselves?',
  },
];

// A deliberately simplified "summarizer" -- a static page has no backend to
// call a real model, so this is a plain-spoken, crude keyword-pull dressed
// up as a quick recap rather than any real analysis.
function generateDumbSummary(userText, insightText) {
  const stopwords = new Set([
    'the', 'a', 'an', 'is', 'it', 'to', 'of', 'and', 'in', 'that', 'this',
    'on', 'for', 'with', 'as', 'be', 'are', 'was', 'i', 'you', 'we', 'or',
    'but', 'not', 'its', 'their', 'they', 'them', 'these', 'so', 'if',
  ]);
  const pickWords = (text) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9'\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopwords.has(w));

  const userWords = pickWords(userText || '');
  const insightWords = pickWords(insightText || '');
  const userKeyword = userWords[0] || 'feelings';
  const sharedKeyword = insightWords.find((w) => userWords.includes(w)) || insightWords[0] || 'data';

  return `Simplified take: your answer is mostly about ${userKeyword}, and the piece above is mostly about ${sharedKeyword} — so there's real overlap there. Both seem to be pointing at the same thing: something personal getting turned into a system to follow.`;
}

const quizOverlay = document.getElementById('quiz-overlay');
const quizHeading = document.getElementById('quiz-heading');
const quizQuestion = document.getElementById('quiz-question');
const quizInputArea = document.getElementById('quiz-input-area');
const quizInsight = document.getElementById('quiz-insight');
const quizInsightText = document.getElementById('quiz-insight-text');
const quizSummary = document.getElementById('quiz-summary');
const quizSummaryText = document.getElementById('quiz-summary-text');
const quizNextBtn = document.getElementById('quiz-next-btn');

let quizStepIndex = 0;
let quizShowingResult = false;

function renderQuizStep() {
  const step = quizSteps[quizStepIndex];
  quizHeading.textContent = step.heading;
  quizQuestion.textContent = step.question;
  quizInputArea.innerHTML = '';
  quizInsight.hidden = true;
  quizSummary.hidden = true;

  if (step.type === 'intro') {
    const beginBtn = document.createElement('button');
    beginBtn.className = 'quiz-btn';
    beginBtn.textContent = 'Begin';
    beginBtn.addEventListener('click', () => {
      quizStepIndex += 1;
      quizShowingResult = false;
      renderQuizStep();
    });
    quizInputArea.appendChild(beginBtn);
    return;
  }

  if (!quizShowingResult) {
    const textarea = document.createElement('textarea');
    textarea.className = 'quiz-textarea';
    textarea.placeholder = 'Type your response here...';
    const submitBtn = document.createElement('button');
    submitBtn.className = 'quiz-btn';
    submitBtn.textContent = 'Submit';
    submitBtn.addEventListener('click', () => {
      const userText = textarea.value.trim() || '(no response entered)';
      quizInsightText.textContent = step.insight;
      quizSummaryText.textContent = generateDumbSummary(userText, step.insight);
      quizInsight.hidden = false;
      quizSummary.hidden = false;
      quizShowingResult = true;
      const isLast = quizStepIndex === quizSteps.length - 1;
      quizNextBtn.textContent = isLast ? 'Finish' : 'Next Question?';
    });
    quizInputArea.appendChild(textarea);
    quizInputArea.appendChild(submitBtn);
  } else {
    quizInsightText.textContent = step.insight;
    quizInsight.hidden = false;
    quizSummary.hidden = false;
    const isLast = quizStepIndex === quizSteps.length - 1;
    quizNextBtn.textContent = isLast ? 'Finish' : 'Next Question?';
  }
}

quizNextBtn.addEventListener('click', () => {
  const isLast = quizStepIndex === quizSteps.length - 1;
  if (isLast) {
    closeFocus();
    return;
  }
  quizStepIndex += 1;
  quizShowingResult = false;
  renderQuizStep();
});

function startQuestionnaire() {
  quizStepIndex = 0;
  quizShowingResult = false;
  renderQuizStep();
  quizOverlay.classList.add('visible');
}

// Mouse-look: subtle head-turn mapped to cursor position
const maxYaw = 0.32;
const maxPitchUp = 0.12;
const maxPitchDown = 0.42;
const lookDownThreshold = -0.16;

const basePosition = camera.position.clone();
const baseQuaternion = new THREE.Quaternion();
const baseEuler = new THREE.Euler(0, 0, 0, 'YXZ');
// A bare Camera (not Object3D) so lookAt() uses the same -Z-forward
// convention as the real camera we copy its quaternion onto.
const focusObject = new THREE.Camera();
const folderWorldPos = new THREE.Vector3();
const folderScreenPos = new THREE.Vector3();
const tabWorldPos = new THREE.Vector3();
const tabProjected = new THREE.Vector3();
const dollyTarget = new THREE.Vector3();
const openTarget = new THREE.Vector3();
const finalPosition = new THREE.Vector3();
const lockEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const lockQuaternion = new THREE.Quaternion();
const HOVER_RADIUS_PX = 90;
const TAB_HOVER_RADIUS_PX = 30;

let mouseX = 0;
let mouseY = 0;
let mouseClientX = window.innerWidth / 2;
let mouseClientY = window.innerHeight / 2;
let currentYaw = 0;
let currentPitch = 0;
let isLookingDown = false;
let hoveredIndex = -1;
let hoveredTab = null;
let openItemIndex = -1;
let viewingMirror = false;
let mirrorProgress = 0;
let showingContent = false;

const folderClose = document.getElementById('folder-close');
const tabTooltip = document.getElementById('tab-tooltip');

// Rich content (image carousel + scrollable text) shown "on" a folder's
// sheet when a section defines images/paragraphs instead of just a title.
const contentOverlay = document.getElementById('content-overlay');
const contentCarousel = document.querySelector('.content-carousel');
const contentHeading = document.getElementById('content-heading');
const contentParagraphs = document.getElementById('content-paragraphs');
const carouselTrack = document.getElementById('carousel-track');
const carouselDots = document.getElementById('carousel-dots');
const carouselPrev = document.getElementById('carousel-prev');
const carouselNext = document.getElementById('carousel-next');

let carouselImages = [];
let carouselIndex = 0;

function renderCarousel() {
  const imgs = carouselTrack.querySelectorAll('.carousel-img');
  imgs.forEach((img, i) => img.classList.toggle('active', i === carouselIndex));
  const dots = carouselDots.querySelectorAll('.carousel-dot');
  dots.forEach((dot, i) => dot.classList.toggle('active', i === carouselIndex));
}

carouselPrev.addEventListener('click', () => {
  carouselIndex = (carouselIndex - 1 + carouselImages.length) % carouselImages.length;
  renderCarousel();
});
carouselNext.addEventListener('click', () => {
  carouselIndex = (carouselIndex + 1) % carouselImages.length;
  renderCarousel();
});

function showContentOverlay(section) {
  const hasImages = Boolean(section.images && section.images.length);
  contentCarousel.style.display = hasImages ? '' : 'none';

  carouselImages = hasImages ? section.images : [];
  carouselIndex = 0;
  carouselTrack.innerHTML = '';
  carouselDots.innerHTML = '';
  carouselImages.forEach((src, i) => {
    const img = document.createElement('img');
    img.className = 'carousel-img';
    img.src = src;
    img.alt = `${section.label} image ${i + 1}`;
    carouselTrack.appendChild(img);

    const dot = document.createElement('button');
    dot.className = 'carousel-dot';
    dot.addEventListener('click', () => {
      carouselIndex = i;
      renderCarousel();
    });
    carouselDots.appendChild(dot);
  });
  renderCarousel();

  contentHeading.textContent = section.label;
  contentParagraphs.innerHTML = '';
  section.paragraphs.forEach((text) => {
    const p = document.createElement('p');
    p.textContent = text;
    contentParagraphs.appendChild(p);
  });

  showingContent = true;
  hoveredTab = null;
  hideTabTooltip();
  contentOverlay.classList.add('visible');
}

function showTabTooltip(screenX, screenY, label) {
  tabTooltip.textContent = label;
  tabTooltip.style.left = `${screenX}px`;
  tabTooltip.style.top = `${screenY}px`;
  tabTooltip.classList.add('visible');
}

function hideTabTooltip() {
  tabTooltip.classList.remove('visible');
}

function selectSection(folder, section) {
  if (section.href) {
    window.location.href = section.href;
    return;
  }
  if (section.images || section.paragraphs) {
    showContentOverlay(section);
    return;
  }
  folder.sheetMaterial.map.dispose();
  folder.sheetMaterial.map = createSheetTexture(section.label, `${section.label} — content coming soon.`);
  folder.sheetMaterial.needsUpdate = true;
}

// A remote button "casts" its content onto the two-way mirror, and the
// camera pans over to look at it there instead of at the remote.
function pressRemoteButton(section) {
  if (section.questionnaire) {
    mirrorContentPlane.visible = false;
    startQuestionnaire();
  } else {
    if (mirrorContentMaterial.map) mirrorContentMaterial.map.dispose();
    mirrorContentMaterial.map = createMirrorContentTexture(
      section.label,
      section.mirrorBody || `${section.label} — content coming soon.`
    );
    mirrorContentMaterial.needsUpdate = true;
    mirrorContentPlane.visible = true;
  }
  viewingMirror = true;
  hoveredTab = null;
  hideTabTooltip();
}

function openItem(index) {
  openItemIndex = index;
  popup.classList.remove('visible');
  folderClose.classList.add('visible');
}

function closeFocus() {
  openItemIndex = -1;
  viewingMirror = false;
  showingContent = false;
  mirrorContentPlane.visible = false;
  quizOverlay.classList.remove('visible');
  contentOverlay.classList.remove('visible');
  hoveredTab = null;
  folderClose.classList.remove('visible');
  hideTabTooltip();
}

folderClose.addEventListener('click', closeFocus);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeFocus();
});
renderer.domElement.addEventListener('click', () => {
  if (viewingMirror) return;
  if (openItemIndex !== -1) {
    if (hoveredTab) {
      const item = deskItems[openItemIndex];
      if (item.type === 'remote') {
        pressRemoteButton(hoveredTab.section);
      } else {
        selectSection(item, hoveredTab.section);
      }
    }
    return;
  }
  if (isLookingDown && hoveredIndex !== -1) {
    openItem(hoveredIndex);
  }
});

window.addEventListener('mousemove', (event) => {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = (event.clientY / window.innerHeight) * 2 - 1;
  mouseClientX = event.clientX;
  mouseClientY = event.clientY;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function updateLook() {
  const targetYaw = -mouseX * maxYaw;
  const targetPitch = mouseY >= 0 ? -mouseY * maxPitchDown : -mouseY * maxPitchUp;

  currentYaw += (targetYaw - currentYaw) * 0.06;
  currentPitch += (targetPitch - currentPitch) * 0.06;

  const shouldLookDown = currentPitch < lookDownThreshold;
  if (shouldLookDown !== isLookingDown) {
    isLookingDown = shouldLookDown;
    if (openItemIndex === -1) popup.classList.toggle('visible', isLookingDown);
  }
}

function updateFoldersAndCamera() {
  baseEuler.set(currentPitch, currentYaw, 0);
  baseQuaternion.setFromEuler(baseEuler);

  // Hover-test by comparing each object's on-screen projected position
  // (using the stable, unzoomed base camera) to the raw cursor pixel
  // position. A true raycast doesn't work here: the same mouse value
  // drives both camera pitch and the ray direction, so the two effects
  // compound and the ray overshoots past whatever the pitch reveals.
  camera.position.copy(basePosition);
  camera.quaternion.copy(baseQuaternion);
  camera.updateMatrixWorld();

  // Watchers behind the glass: pop up on their own on a timer (shortly
  // after load, then roughly once a minute) rather than needing a hover.
  // Only while free-looking -- not mid-focus on a desk item or the mirror
  // content itself.
  const canRevealSilhouettes = openItemIndex === -1 && !viewingMirror;
  const cyclePos = (performance.now() / 1000 - SILHOUETTE_DELAY_S) % SILHOUETTE_INTERVAL_S;
  const shouldShowSilhouettes = canRevealSilhouettes && cyclePos >= 0 && cyclePos < SILHOUETTE_VISIBLE_S;
  Object.values(mirrorSilhouettes).forEach((silhouette) => {
    silhouette.hoverAmount += ((shouldShowSilhouettes ? 1 : 0) - silhouette.hoverAmount) * 0.04;
    silhouette.material.opacity = silhouette.hoverAmount;
  });

  if (isLookingDown && openItemIndex === -1) {
    let closestIndex = -1;
    let closestDist = Infinity;
    deskItems.forEach((item, index) => {
      item.mesh.getWorldPosition(folderWorldPos);
      folderScreenPos.copy(folderWorldPos).project(camera);
      const screenX = (folderScreenPos.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-folderScreenPos.y * 0.5 + 0.5) * window.innerHeight;
      const dist = Math.hypot(screenX - mouseClientX, screenY - mouseClientY);
      if (dist < HOVER_RADIUS_PX && dist < closestDist) {
        closestDist = dist;
        closestIndex = index;
      }
    });
    hoveredIndex = closestIndex;
  } else {
    hoveredIndex = -1;
  }

  let focusAmount = 0;
  let focusedItem = null;
  deskItems.forEach((item, index) => {
    const target = openItemIndex === index ? 1 : openItemIndex === -1 && hoveredIndex === index ? 1 : 0;
    item.hoverAmount += (target - item.hoverAmount) * 0.08;
    if (item.hoverAmount > focusAmount) {
      focusAmount = item.hoverAmount;
      focusedItem = item;
    }
  });

  // Ease every folder's cover open or closed (the remote has no hinge).
  // The item itself stays put on the desk -- the camera moves instead.
  deskItems.forEach((item, index) => {
    const targetOpen = openItemIndex === index ? 1 : 0;
    item.openProgress += (targetOpen - item.openProgress) * 0.08;
    if (item.hinge) item.hinge.rotation.z = item.openProgress * FOLDER_OPEN_ANGLE;
  });

  camera.position.copy(basePosition);
  camera.quaternion.copy(baseQuaternion);

  if (openItemIndex !== -1) {
    const item = deskItems[openItemIndex];
    item.mesh.getWorldPosition(folderWorldPos);

    // Blend from the pre-open hover dolly up into a position directly above
    // the item, looking down -- like leaning over the desk, rather than the
    // item itself moving. Matching x exactly (not a fraction of it) keeps
    // the view centered instead of raking in from one side.
    dollyTarget.set(folderWorldPos.x * 0.5, deskTopHeight + 0.4, folderWorldPos.z + 0.55);
    openTarget.set(folderWorldPos.x, deskTopHeight + 0.5, folderWorldPos.z + 0.06);
    finalPosition.copy(dollyTarget).lerp(openTarget, item.openProgress);

    focusObject.position.copy(finalPosition);
    focusObject.lookAt(folderWorldPos);

    // A small look-around offset layered on the locked "reading" direction
    // -- you can glance around the item but can't pan away from it.
    lockEuler.set(-mouseY * 0.07, mouseX * 0.09, 0, 'YXZ');
    lockQuaternion.setFromEuler(lockEuler);

    camera.position.copy(finalPosition);
    camera.quaternion.copy(focusObject.quaternion).multiply(lockQuaternion);
    camera.updateMatrixWorld();

    if (!viewingMirror && !showingContent) {
      let closestTab = null;
      let closestDist = Infinity;
      item.tabs.forEach((tab) => {
        tab.mesh.getWorldPosition(tabWorldPos);
        tabProjected.copy(tabWorldPos).project(camera);
        const screenX = (tabProjected.x * 0.5 + 0.5) * window.innerWidth;
        const screenY = (-tabProjected.y * 0.5 + 0.5) * window.innerHeight;
        const dist = Math.hypot(screenX - mouseClientX, screenY - mouseClientY);
        if (dist < TAB_HOVER_RADIUS_PX && dist < closestDist) {
          closestDist = dist;
          closestTab = { ...tab, screenX, screenY };
        }
      });
      hoveredTab = closestTab;

      if (hoveredTab) {
        showTabTooltip(hoveredTab.screenX, hoveredTab.screenY, hoveredTab.section.label);
      } else {
        hideTabTooltip();
      }
      renderer.domElement.style.cursor = hoveredTab ? 'pointer' : 'default';
    } else {
      hoveredTab = null;
      renderer.domElement.style.cursor = 'default';
    }
  } else {
    renderer.domElement.style.cursor = hoveredIndex !== -1 ? 'pointer' : 'default';

    if (focusAmount > 0.001 && focusedItem) {
      focusedItem.mesh.getWorldPosition(folderWorldPos);
      dollyTarget.set(folderWorldPos.x * 0.5, deskTopHeight + 0.4, folderWorldPos.z + 0.55);
      finalPosition.copy(basePosition).lerp(dollyTarget, focusAmount);

      focusObject.position.copy(finalPosition);
      focusObject.lookAt(folderWorldPos);

      camera.position.copy(finalPosition);
      camera.quaternion.copy(baseQuaternion).slerp(focusObject.quaternion, focusAmount);
    }
  }

  // Layered on top of whatever was just computed above: ease toward (or
  // away from) looking at the mirror when a remote button has cast content
  // onto it.
  const mirrorTarget = viewingMirror ? 1 : 0;
  mirrorProgress += (mirrorTarget - mirrorProgress) * 0.06;
  if (mirrorProgress > 0.001) {
    focusObject.position.copy(mirrorViewPosition);
    focusObject.lookAt(mirrorLookTarget);
    camera.position.lerp(mirrorViewPosition, mirrorProgress);
    camera.quaternion.slerp(focusObject.quaternion, mirrorProgress);
  }
}

function animate() {
  requestAnimationFrame(animate);
  updateLook();
  updateFoldersAndCamera();
  renderer.render(scene, camera);
}

animate();
