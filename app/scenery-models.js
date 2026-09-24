import * as THREE from 'three';

// Shared, low-poly scenery models: one merged geometry per catalog type.
export function addSceneryParts(type, part) {
  function stem(a, b, radius, color, top = radius * .65, sides = 5) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), direction = to.clone().sub(from);
    const geometry = new THREE.CylinderGeometry(top, radius, direction.length(), sides);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    const middle = from.add(to).multiplyScalar(.5);
    part(geometry, color, middle.x, middle.y, middle.z);
  }
  function crown(x, y, z, radius, color, sx = 1, sy = 1, sz = 1) {
    part(new THREE.IcosahedronGeometry(radius, 0), color, x, y, z, sx, sy, sz);
  }
  function leaf(a, b, width, color) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), direction = to.clone().sub(from);
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    geometry.scale(width, direction.length() * .5, width * .18);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    const middle = from.add(to).multiplyScalar(.5);
    part(geometry, color, middle.x, middle.y, middle.z);
  }
  if (type === 'spruce') {
    stem([0, 0, 0], [0, 17, 0], .65, '#655440');
    for (let i = 0; i < 5; i++) part(new THREE.ConeGeometry(4 - i * .65, 6.5 - i * .4, 8), i % 2 ? '#355f55' : '#2b514b', 0, 5 + i * 2.9, 0);
  } else if (type === 'birch') {
    stem([0, 0, 0], [.5, 13, 0], .45, '#dbd9c7', .19);
    for (let i = 1; i < 8; i++) part(new THREE.CylinderGeometry(.38, .42, .16, 5), '#565953', i * .045, i * 1.4, .01);
    stem([.3, 7, 0], [-2, 11, 1], .2, '#cfcebc');
    crown(-1.1, 11, .4, 2.7, '#9caf66', .8, 1.4, .8);
    crown(1, 13.5, 0, 2.6, '#b0be73', .85, 1.25, .85);
  } else if (type === 'willow') {
    stem([0, 0, 0], [.3, 10, 0], .95, '#76694d');
    crown(0, 11, 0, 5.4, '#809b60', 1.15, .65, 1.15);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, x = Math.cos(a) * 4.2, z = Math.sin(a) * 4.2;
      stem([0, 7, 0], [x, 10, z], .24, '#76694d');
      crown(x, 7.8, z, 2.9, i % 2 ? '#6b8954' : '#7b955d', .85, 1.55, .85);
    }
  } else if (type === 'autumn') {
    stem([0, 0, 0], [0, 11, 0], .9, '#705340');
    crown(0, 12, 0, 4.5, '#c58339', 1.1, .9, 1.1);
    crown(-2.8, 9.5, 1.1, 3, '#ad5133');
    crown(2.7, 10.5, -.7, 3.2, '#d39a46');
  } else if (type === 'dead-tree') {
    stem([0, 0, 0], [.5, 13, 0], .7, '#8a7c65', .12);
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4, y = 4 + i * 1.4, x = Math.cos(a) * 2.8, z = Math.sin(a) * 2.8;
      stem([.2, y, 0], [x, y + 1.5, z], .24, '#83725a', .09);
      stem([x, y + 1.5, z], [x * 1.2, y + 3.5, z * 1.2], .1, '#9b8a70', .025);
    }
  } else if (type === 'grass' || type === 'reeds' || type === 'flowers') {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = .3 + (i % 3) * .5, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 1.4 + (i % 4) * .55;
      if (type === 'grass') leaf([x, 0, z], [x * 1.4, h, z * 1.4], .2, i % 2 ? '#a3ac62' : '#7d9250');
      else {
        stem([x, 0, z], [x, h, z], .055, '#7d9054', .035, 4);
        leaf([x, h * .35, z], [x + Math.cos(a) * .65, h * .7, z + Math.sin(a) * .65], .16, '#8b9b54');
        if (type === 'reeds') part(new THREE.CylinderGeometry(.14, .14, .65, 5), '#69543a', x, h, z);
        else crown(x, h, z, .32, ['#b592c0', '#e7c777', '#d1d6c3'][i % 3], 1, .4, 1);
      }
    }
  } else if (type === 'fern' || type === 'yucca') {
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5, r = type === 'fern' ? 2.2 : 2.7, x = Math.cos(a) * r, z = Math.sin(a) * r;
      leaf([0, .2, 0], [x, type === 'fern' ? .6 : 1.8, z], type === 'fern' ? .5 : .17, type === 'fern' ? (i % 2 ? '#579260' : '#397344') : '#93956a');
    }
    if (type === 'yucca') { stem([0, 0, 0], [0, 3.5, 0], .1, '#93815d'); crown(0, 3.5, 0, .65, '#d1c6a0', .65, 1.3, .65); }
  } else if (type === 'boulder') {
    const stone = new THREE.IcosahedronGeometry(5.2, 1); stone.rotateZ(.3);
    part(stone, '#92999b', 0, 2.6, 0, 1, .85, .9);
    crown(3, .8, -1, 1.8, '#adb0a3', 1, .7, 1);
  } else if (type === 'scree') {
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4, r = Math.sqrt(i / 12) * 3.7, size = .5 + (i % 3) * .3;
      crown(Math.cos(a) * r, size * .35, Math.sin(a) * r, size, i % 2 ? '#9b9e92' : '#b2afa0', 1.25, .6, 1);
    }
  } else if (type === 'basalt') {
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI / 3, r = i === 6 ? 0 : 2.3, height = 4 + (i % 3) * 1.7;
      part(new THREE.CylinderGeometry(1.15, 1.3, height, 6), i % 2 ? '#68737a' : '#515d65', Math.cos(a) * r, height * .5 - .2, Math.sin(a) * r);
    }
  } else if (type === 'sandstone') {
    for (let i = 0; i < 4; i++) {
      const height = 4.5 + (i % 3) * 2;
      part(new THREE.CylinderGeometry(2.1, 2.5, height, 5), i % 2 ? '#c69768' : '#ad7955', (i % 2 - .5) * 5, height / 2 - .25, (Math.floor(i / 2) - .5) * 4);
      part(new THREE.CylinderGeometry(2.2, 2.2, .35, 5), '#dec09a', (i % 2 - .5) * 5, height * .72, (Math.floor(i / 2) - .5) * 4);
    }
  } else if (type === 'cactus') {
    stem([0, 0, 0], [0, 9, 0], .65, '#587f59', .55, 8); crown(0, 9, 0, .56, '#719568');
    for (const [x, y] of [[-2, 4], [2, 5.5]]) {
      stem([0, y, 0], [x, y, 0], .4, '#587f59', .4, 6);
      stem([x, y, 0], [x, y + 2.8, 0], .4, '#64895e', .34, 6); crown(x, y + 2.8, 0, .35, '#78996a');
    }
  } else if (type === 'palm') {
    stem([0, 0, 0], [1, 13, 0], .75, '#9b8059', .4, 7);
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9, x = Math.cos(a) * 5.3, z = Math.sin(a) * 5.3;
      leaf([1, 13, 0], [1 + x * .55, 14.2, z * .55], .7, '#81964e');
      leaf([1 + x * .55, 14.2, z * .55], [1 + x, 11.7, z], .6, '#637f42');
    }
    crown(.8, 12.5, .5, .6, '#86613b');
  } else throw new Error('Unknown scenery model: ' + type);
}

