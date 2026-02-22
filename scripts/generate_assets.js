const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../src/assets');
const EFFECTS_DIR = path.join(ASSETS_DIR, 'effects');
const RAMPS_DIR = path.join(ASSETS_DIR, 'speed-ramps');
const TRANSITIONS_DIR = path.join(ASSETS_DIR, 'transitions');

// Ensure directories exist
[EFFECTS_DIR, RAMPS_DIR, TRANSITIONS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const generateEffect = (i) => ({
    id: `fx_gen_${i}`,
    name: `Generated Effect ${i}`,
    type: 'effect',
    description: `Auto-generated effect variant ${i}`,
    shader: `hue-rotate(${i * 10}deg) sepia(${i * 5}%)`,
    parameters: { hue: i * 10, sepia: i * 5 }
});

const generateRamp = (i) => ({
    id: `ramp_gen_${i}`,
    name: `Generated Ramp ${i}`,
    type: 'speed-ramp',
    description: `Auto-generated speed ramp ${i}`,
    points: [
        { x: 0, y: 1.0 },
        { x: 0.5, y: 1.0 + (i * 0.1) },
        { x: 1.0, y: 1.0 }
    ]
});

const generateTransition = (i) => ({
    id: `trans_gen_${i}`,
    name: `Generated Time Warp ${i}`,
    type: 'transition',
    description: `Auto-generated transition ${i}`,
    duration: 0.5 + (i * 0.1),
    style: i % 2 === 0 ? 'fade' : 'slide'
});

// Generate Ramps (Target 20)
const existingRamps = fs.readdirSync(RAMPS_DIR).filter(f => f.endsWith('.json'));
let rampCount = existingRamps.length;
for (let i = rampCount + 1; i <= 20; i++) {
    const ramp = generateRamp(i);
    fs.writeFileSync(path.join(RAMPS_DIR, `${ramp.id}.json`), JSON.stringify(ramp, null, 4));
}

// Generate Effects (Target 20)
const existingEffects = fs.readdirSync(EFFECTS_DIR).filter(f => f.endsWith('.json'));
let effectCount = existingEffects.length;
for (let i = effectCount + 1; i <= 20; i++) {
    const effect = generateEffect(i);
    fs.writeFileSync(path.join(EFFECTS_DIR, `${effect.id}.json`), JSON.stringify(effect, null, 4));
}

// Generate Transitions (Target 12)
const existingTransitions = fs.readdirSync(TRANSITIONS_DIR).filter(f => f.endsWith('.json'));
let transCount = existingTransitions.length;
for (let i = transCount + 1; i <= 12; i++) {
    const trans = generateTransition(i);
    fs.writeFileSync(path.join(TRANSITIONS_DIR, `${trans.id}.json`), JSON.stringify(trans, null, 4));
}

// Update Registry
const getIds = (dir) => fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));

const registry = {
    speedRamps: getIds(RAMPS_DIR),
    effects: getIds(EFFECTS_DIR),
    transitions: getIds(TRANSITIONS_DIR)
};

fs.writeFileSync(path.join(ASSETS_DIR, 'registry.json'), JSON.stringify(registry, null, 4));

console.log('Assets generated and registry updated.');
console.log('Ramps:', registry.speedRamps.length);
console.log('Effects:', registry.effects.length);
console.log('Transitions:', registry.transitions.length);
