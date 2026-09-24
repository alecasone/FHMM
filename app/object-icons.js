export function objectIcon(type) {
  const shapes = {
    conifer: 'M24 2 8 22h7L5 33h38L33 22h7Z',
    tree: 'M8 25C0 14 13 7 18 10 19-1 34-1 35 10 49 10 49 28 37 29L12 30Z',
    birch: 'M14 28C4 14 16 2 23 8 25-3 39 6 36 17 44 30 29 34 14 28Z',
    willow: 'M5 32 7 16Q24-5 41 16L44 34 36 28 33 37 28 29 23 36 18 29 11 37Z',
    dead: 'M22 39V23L9 12l2-2 11 8V3h3v14L37 8l2 3-14 11v17Z',
    shrub: 'M5 34Q0 19 13 21 16 7 28 18 44 10 44 32Z',
    grass: 'M22 39 7 10 20 27 16 3 26 25 33 5 30 30 44 15 32 39Z',
    fern: 'M24 39 4 23 18 25 5 11 23 20 21 3 29 20 43 9 34 28 46 25 28 39Z',
    reeds: 'M12 39V13h3v26h8V7h3v32h10V16h3v23Z',
    flowers: 'M13 39 12 13h3l1 26h9V7h3v32h10V19h3v20Z',
    rock: 'M4 32 11 15 26 7 42 22 39 36 16 38Z',
    scree: 'M2 32 7 22 16 27 13 36ZM16 21 21 11 30 14 33 24ZM28 35 34 25 44 30 42 39Z',
    columns: 'M5 35V17l8-5 8 5v18Zm15 0V8l8-5 8 5v27Zm15 0V21l6-4 6 4v18Z',
    cactus: 'M21 39V25H11l-4-4V10h6v10h8V5q3-6 7 0v22h7V16h6v15l-4 3h-9v5Z',
    palm: 'M23 15 2 20Q8 8 20 11L8 2Q22 0 25 9 36-3 43 4L30 12Q42 8 48 23L29 17Z',
  };
  const trunk = ['tree','conifer','birch','willow','palm'].includes(type.symbol) ? '<path d="M22 19h4l2 21h-7Z" fill="' + (type.symbol === 'birch' ? '#dbd9c7' : '#987450') + '"/>' : '';
  const flowers = type.symbol === 'flowers' ? '<g fill="#e8d39c"><circle cx="13" cy="12" r="5"/><circle cx="27" cy="7" r="5"/><circle cx="40" cy="18" r="4"/></g>' : type.symbol === 'reeds' ? '<path d="M11 7h5v10h-5ZM22 2h5v9h-5ZM35 11h5v9h-5Z" fill="#8a6742"/>' : '';
  return trunk + '<path d="' + shapes[type.symbol] + '" fill="' + type.color + '" stroke="#ffffff28" stroke-width=".8"/>' + flowers;
}
