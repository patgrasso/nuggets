const rasterizer = Rasterizer(document.getElementById('app'));

/**
 * A rasterization demonstration! This demo renders a SVG DOM consisting of a
 * grid and an n-sided polygon. The vertices of the polygon are moveable, and
 * whenever the polygon is reshaped, the squares inside of it are colored.
 *
 * This is similar to how images are rendered on a pixelated screen (such as the
 * one you're likely using to read this!), only the "pixels" are scaled up so
 * you can see them clearly.
 *
 * Twitter: @bluesledmaster
 * GitHub:  @patgrasso
 * 
 * @param {HTMLElement} anchor - Element to append the <svg> to
 * @param {string} options.backgroundColor - Background color
 * @param {string} options.tileBorderColor - Color of each tile's border
 * @param {string} options.tileActiveColor - Color to fill each active tile with
 * @param {number} options.tileSize - Size of each tile
 */
function Rasterizer(anchor, options) {
  if (!anchor || !(anchor instanceof HTMLElement)) {
    throw new TypeError('anchor must be a valid HTMLElement');
  }

  options = Object.assign({
    // Default options
    backgroundColor: '#000000',
    tileBorderColor: '#222222',
    tileActiveColor: '#db0167',
    tileSize: 20,
  }, options);

  // Load up settings from localStorage.
  const settings = Object.assign({
    sides: 4,
    points: undefined,
  }, JSON.parse(localStorage.getItem('rasterizer.settings') || '{}'));

  // Create our top level elements and wire them together.
  const canvas = Canvas(options);
  let polygon = Polygon({ 
    sides: settings.sides,
    points: settings.points,
  });
  canvas.add(polygon);

  // Let's keep track of where the polygon is at!
  createDelayedListener(polygon, 'shape.move', () => {
    localStorage.setItem(
      'rasterizer.settings',
      JSON.stringify(Object.assign({}, settings, {
        sides: polygon.sides(),
        points: polygon.vertexPositions(),
      }))
    );
  }, 200);

  function redraw() {
    canvas.setActiveTiles(polygon.computeFilledSquares(options.tileSize));
  }

  // TODO: adjustability!
  function setNumSides(n) {
    canvas.remove(polygon)
  }

  polygon.addEventListener('shape.move', redraw);
  canvas.addEventListener('load', redraw);
  canvas.addEventListener('canvas.resize', redraw);

  const controlPanel = ControlPanel();
  controlPanel.onReset(() => {
    localStorage.removeItem('rasterizer.settings');
    location.reload();
  });

  anchor.appendChild(canvas.el);
  anchor.appendChild(controlPanel.el);

  // Firefox doesn't emit the "load" event on <svg> elements once they're
  // appended to the body like Chrome and IE do. To get around this, just
  // execute the "on load" behavior here after we've appended them to the DOM.
  canvas.redrawTiles();
  redraw();

  return Object.freeze({
    canvas,
    polygon,
  });
}

function ControlPanel() {
  const panel = createElement('div', {
    className: 'control-panel',
  });

  const resetBtn = createElement('button', {
  });
  resetBtn.innerText = 'Reset';

  panel.appendChild(resetBtn);

  function onReset(cb) {
    return resetBtn.addEventListener('click', cb);
  }

  return {
    el: panel,
    onReset,
  };
}

/**
 * Construct a `sides`-sided polygon in a <g> with <circle> vertices and <line>
 * edges connecting them.
 * 
 * @param {{x: number, y: number}[]} options.points - A list of objects with
 *    `x` and `y` attributes. The list should be of length `options.sides`, but
 *    if it isn't, points may be placed in unusual places :).
 */
function Polygon(options) {
  options = Object.assign({
    sides: 3,
  }, options);

  const vertices = [];
  const edges = [];

  const polygon = createSVGElement('g');
  initializePieces();

  // Initialize vertices radially, moving counter-clockwise and distributing
  // evenly.
  function initializePieces() {
    for (let sideIndex = 0; sideIndex < options.sides; sideIndex += 1) {
      let x = 150 + Math.cos((Math.PI * 2 * sideIndex + Math.PI / 2) / options.sides) * 100;
      let y = 150 + Math.sin((Math.PI * 2 * sideIndex + Math.PI / 2) / options.sides) * 100;

      if (options.points && options.points[sideIndex]) {
        x = options.points[sideIndex].x;
        y = options.points[sideIndex].y;
      }

      const vertex = Vertex({ x, y });
      vertices.push(vertex);
    }

    for (let edgeIndex = 0; edgeIndex < options.sides; edgeIndex += 1) {
      const edge = Edge({
        leftVertex: vertices[edgeIndex],
        rightVertex: vertices[(edgeIndex + 1) % options.sides],
      });
      edges.push(edge);
      edge.addEventListener('shape.move', () => emitCustomEvent(polygon, 'shape.move'));
    }

    // Even though we could have appended them in the loops above, adding them
    // in this order ensures that the vertices get rendered *after* the edges,
    // so click events will never be swallowed by edges.
    edges.map(edge => polygon.appendChild(edge.el));
    vertices.map(edge => polygon.appendChild(edge.el));
  }

  function computeFilledSquares(tileSize) {
    const squares = {};
    const xValues = {};

    //const svg = getParentSVG(edges[0].el);

    const accumulateSquaresForEdge = (edge, i) => {
      const position = edge.position();
      const x1 = position.x1 + (tileSize / 2);
      const x2 = position.x2 + (tileSize / 2);
      const y1 = position.y1 - (tileSize / 2);
      const y2 = position.y2 - (tileSize / 2);
      const rise = y2 - y1;
      const run = x2 - x1;
      const m = run === 0 ? 0 : (rise / run);
      const b = y1 - m * x1;

      const ya = Math.min(y1, y2);
      const yb = Math.max(y1, y2);

      for (let y = floor(ya, tileSize) + tileSize; y <= yb; y += tileSize) {
        const x = floor((y - b) / m, tileSize);

        if (xValues[y] !== undefined) {
          const xa = Math.min(x, xValues[y]);
          const xb = Math.max(x, xValues[y]);

          for (let tileX = xa; tileX < xb; tileX += tileSize) {
            if (!squares[tileX / tileSize]) {
              squares[tileX / tileSize] = [];
            }
            squares[tileX / tileSize].push(y / tileSize);
            //squares.push([tileX / tileSize, y / tileSize]);
          }

          delete xValues[y];
        } else {
          xValues[y] = floor(x, tileSize);
        }
      }
    };

    edges.forEach(accumulateSquaresForEdge);

    return squares;
  }

  function vertexPositions() {
    return vertices.map(v => v.position());
  }

  function sides() {
    return vertices.length;
  }

  return Object.freeze({
    vertices,
    edges,
    computeFilledSquares,
    vertexPositions,
    sides,
    el: polygon,
    addEventListener: polygon.addEventListener.bind(polygon),
  });
}

function Vertex(options, attributes) {
  options = Object.assign({
    x: 0,
    y: 0,
    color: '#ffffff',
    radius: 10,
  }, options);

  const mouseGrabOffset = {
    x: 0,
    y: 0,
  };

  const vertex = createSVGElement('circle', Object.assign({
    fill: options.color,
    cx: options.x,
    cy: options.y,
    r: options.radius,
  }, attributes));

  function handleMove(evt, point) {
    evt.preventDefault();
    evt.stopPropagation();
    const newX = point.x - mouseGrabOffset.x;
    const newY = point.y - mouseGrabOffset.y;
    vertex.setAttribute('cx', newX);
    vertex.setAttribute('cy', newY);
    emitCustomEvent(vertex, 'shape.move');
  }

  const handleMouseMove = evt => handleMove(evt, mouseEventPoint(evt));
  const handleTouchMove = evt => handleMove(evt, touchEventPoint(evt));

  function handleStart(point) {
    mouseGrabOffset.x = point.x - (parseInt(vertex.getAttribute('cx')) || 0);
    mouseGrabOffset.y = point.y - (parseInt(vertex.getAttribute('cy')) || 0);
  }

  function handleMouseDown(evt) {
    handleStart(mouseEventPoint(evt));
    getParentSVG(vertex).addEventListener('mousemove', handleMouseMove);
  }

  function handleTouchStart(evt) {
    handleStart(touchEventPoint(evt));
    getParentSVG(vertex).addEventListener('touchmove', handleTouchMove);
  }

  function handleEnd(evt) {
    getParentSVG(vertex).removeEventListener('mousemove', handleMouseMove);
    getParentSVG(vertex).removeEventListener('touchmove', handleTouchMove);
    mouseGrabOffset.x = 0;
    mouseGrabOffset.y = 0;
  }

  vertex.addEventListener('mousedown', handleMouseDown);
  vertex.addEventListener('touchstart', handleTouchStart);
  window.addEventListener('mouseup', handleEnd);
  window.addEventListener('touchend', handleEnd);

  function position() {
    return {
      x: parseInt(vertex.getAttribute('cx')),
      y: parseInt(vertex.getAttribute('cy')),
    };
  }

  return {
    el: vertex,
    addEventListener: vertex.addEventListener.bind(vertex),
    position,
  };
}

function Edge(options, attributes) {
  options = Object.assign({
    color: '#ffffff',
    width: 1,
    x1: options.leftVertex ? options.leftVertex.el.getAttribute('cx') : 0,
    y1: options.leftVertex ? options.leftVertex.el.getAttribute('cy') : 0,
    x2: options.leftVertex ? options.rightVertex.el.getAttribute('cx') : 100,
    y2: options.leftVertex ? options.rightVertex.el.getAttribute('cy') : 100,
    leftVertex: null,
    rightVertex: null,
  }, options);

  if (options.leftVertex) {
    options.leftVertex.addEventListener('shape.move', (evt) => {
      edge.setAttribute('x1', evt.target.getAttribute('cx'));
      edge.setAttribute('y1', evt.target.getAttribute('cy'));
      emitCustomEvent(edge, 'shape.move');
    });
  }

  if (options.rightVertex) {
    options.rightVertex.addEventListener('shape.move', (evt) => {
      edge.setAttribute('x2', evt.target.getAttribute('cx'));
      edge.setAttribute('y2', evt.target.getAttribute('cy'));
      emitCustomEvent(edge, 'shape.move');
    });
  }

  const edge = createSVGElement('line', Object.assign({
    stroke: options.color,
    'stroke-width': options.width,
    x1: options.x1,
    y1: options.y1,
    x2: options.x2,
    y2: options.y2,
  }, attributes));

  edge.leftVertex = options.leftVertex;
  edge.rightVertex = options.rightVertex;

  function position() {
    return {
      x1: parseInt(this.el.getAttribute('x1')),
      y1: parseInt(this.el.getAttribute('y1')),
      x2: parseInt(this.el.getAttribute('x2')),
      y2: parseInt(this.el.getAttribute('y2')),
    };
  };

  return {
    position,
    el: edge,
    addEventListener: edge.addEventListener.bind(edge),
    leftVertex: options.leftVertex,
    rightVertex: options.rightVertex,
  };
}

/**
 * Creates an <svg> node with a tiled grid background, the coloring and sizing
 * of the tiles specified in `options`.
 *
 * @param options - {@see Rasterizer}
 * @param attributes - HTML attributes valid for the 'svg' tag
 */
function Canvas(options, attributes) {
  options = Object.assign({
    tileActiveColor: '#db0167',
  }, options);

  const svg = createSVGElement('svg', Object.assign({
    className: 'canvas',
    width: '100%',
    height: '100%',
  }, attributes));

  svg.setAttributeNS(
    'http://www.w3.org/2000/xmlns/',
    'xmlns:xlink',
    'http://www.w3.org/1999/xlink',
  );

  const defs = createSVGElement('defs');
  const grid = createSVGElement('pattern', {
    id: 'grid',
    width: options.tileSize,
    height: options.tileSize,
    patternUnits: 'userSpaceOnUse',
  });
  const gridPath = createSVGElement('path', {
    d: `M ${options.tileSize} 0 L 0 0 0 ${options.tileSize}`,
    fill: 'none',
    stroke: options.tileBorderColor,
    'stroke-width': 2,
  });

  grid.appendChild(gridPath);
  defs.appendChild(grid);
  svg.appendChild(defs);

  const background = createSVGElement('rect', {
    width: '100%',
    height: '100%',
    fill: options.backgroundColor,
  });
  svg.appendChild(background);
  svg.appendChild(createSVGElement('rect', {
    width: '100%',
    height: '100%',
    fill: 'url(#grid)',
  }));

  let tiles = [];
  let tileGroup;

  function redrawTiles() {
    const newTileGroup = createSVGElement('g');
    const newTiles = [];

    for (let y = 0; y < svg.clientHeight; y += options.tileSize) {
      const tileRow = [];
      for (let x = 0; x < svg.clientWidth; x += options.tileSize) {
        const tile = Tile({
          x,
          y,
          width: options.tileSize,
          height: options.tileSize,
          style: {
            fill: 'none',
            stroke: options.tileBorderColor,
            strokeWidth: 1,
          },
        });
        newTileGroup.appendChild(tile.el);
        tileRow.push(tile);
      }
      newTiles.push(tileRow);
    }

    try { svg.removeChild(tileGroup) } catch (e) {}

    svg.insertBefore(newTileGroup, background.nextSibling);
    tiles = newTiles;
    tileGroup = newTileGroup;
  }

  const emitResizeEvent = () => emitCustomEvent(svg, 'canvas.resize');
  createDelayedListener(window, 'resize', emitResizeEvent, 100);

  svg.addEventListener('load', redrawTiles);
  svg.addEventListener('canvas.resize', redrawTiles);

  function add(elements) {
    normalizeNodeList(elements).forEach(element => svg.appendChild(element));
  }

  function remove(elements) {
    normalizeNodeList(elements).forEach(element => svg.removeChild(element));
  }

  /**
   * @param activeTiles - List of coordinate tuples to be painted.
   */
  function setActiveTilesTuples(activeTiles) {
    tiles.forEach((row) => row.forEach((tile) => tile.el.style.fill = 'none'));
    activeTiles.forEach((position) => {
      const tile = (tiles[position[1]] || [])[position[0]];
      if (tile) {
        tile.el.style.fill = options.tileActiveColor;
      }
    });
  };

  /**
   * @param activeTiles - Map of coordinates where the key is the x-coordinate
   *    and the value is a list of y-coordinates
   */
  function setActiveTilesDict(activeTiles) {
    tiles.forEach((row) => row.forEach((tile) => tile.el.style.fill = 'none'));
    Object.entries(activeTiles).forEach(([x, ys]) => {
      ys.forEach((y) => {
        const tile = (tiles[y] || [])[x];
        if (tile) {
          tile.el.style.fill = options.tileActiveColor;
        }
      })
    });
  };

  return {
    add,
    remove,
    redrawTiles,
    el: svg,
    addEventListener: svg.addEventListener.bind(svg),
    setActiveTiles: setActiveTilesDict,
  };
}

function Tile(attributes) {
  const el = createSVGElement('rect', Object.assign({
    className: 'tile',
  }, attributes, {
    style: Object.assign({
      fill: '#ff1493',
      stroke: '#333333',
      strokeWidth: 1,
    }, attributes.style || {}),
  }));

  return {
    el,
    addEventListener: el.addEventListener.bind(el),
  };
}

/**
 * Finds the nearest parent <svg> element relative to the given `node` and
 * throws a `TypeError` if no such parent could be found.
 */
function getParentSVG(node) {
  const parentSVG = node.closest('svg');
  if (!parentSVG) {
    throw new TypeError(
      'Apparently this element (<' +
      node.tagName.toLowerCase() +
      '>) does not live inside an <svg> element. No bueno.'
    );
  }
  return parentSVG;
}

/**
 * Convenience wrapper around `document.createElement()` which also assigns
 * the attributes given as an object to the element.
 */
function createElement(tag, attributes) {
  const elem = document.createElement(tag);
  setElementAttributes(elem, attributes);
  return elem;
}

/**
 * Creates an SVG element (rect, circle, path, svg, etc.). These are separate
 * from HTML elements and require use of `document.createElementNS()`. Trying
 * to use `document.createElement()` for SVG elements will return
 * HTMLUnknownElement.
 */
function createSVGElement(tag, attributes) {
  const elem = document.createElementNS('http://www.w3.org/2000/svg', tag);
  setElementAttributes(elem, attributes);
  return elem;
}

function normalizeNodeList(elements) {
  if (!elements) {
    return [];
  }
  if (!Array.isArray(elements)) {
    elements = [elements];
  }
  return elements.map(el => {
    if (el instanceof Node) {
      return el;

    // We do this throughout -- wrap nodes and return an object with an 'el'
    // property exposing the node.
    } else if (el.el instanceof Node) {
      return el.el;
    }
  }).filter(el => el !== undefined);
}

/**
 * Assigns attributes, provided as a map/object/dictionary, to an element.
 *
 * Stick to using the HTML attribute names ('snake-case="value"') rather than
 * the JS ones ('elem.camelCase = "value"'). There are some special cases
 * though:
 *
 *  - `className` gets assigned to the "class" attribute
 *  - `style` can be an object, and it will be assigned to the element's
 *    `style` property, which contains camelCase binings for all CSS properties
 *
 * @example
 *    setElementAttributes(appleElem, {
 *      id: 'apple',
 *      className: 'fruit',
 *      'data-color': 'red',
 *      style: {
 *        color: 'red',
 *      },
 *    });
 */
function setElementAttributes(elem, attributes) {
  if (!attributes) {
    return elem;
  }
  for (const key in attributes) {
    switch (key) {
      case 'className':
        elem.setAttribute('class', attributes[key]);
        break;

      case 'style':
        const style = attributes[key];
        if (typeof style === 'object') {
          Object.assign(elem.style, style);
        } else {
          elem.setAttribute(key, style);
        }
        break;

      default:
        elem.setAttribute(key, attributes[key]);
        break;
    }
  }
  return elem;
}

function mouseEventPoint(evt) {
  return {
    x: evt.clientX,
    y: evt.clientY,
  };
}

function touchEventPoint(evt) {
  if (evt.targetTouches.length < 1) {
    return;
  }
  return {
    x: evt.targetTouches[0].clientX,
    y: evt.targetTouches[0].clientY,
  };
}

/**
 * Returns the closest (below) number that divides evenly into `modulo`.
 * 
 * @param {number} n
 * @param {number} modulo
 */
function floor(n, modulo) {
  return Math.floor(n - n % modulo);
}

/**
 * Uses the builtin HTML node event system to emit a custom event on an element.
 * Subscribers can use `element.addEventListener()` just like with any other
 * type of event.
 * 
 * NOTE: be sure to avoid reusing existing event names.
 * 
 * @param {HTMLElement} element - HTML element node to dispatch event on
 * @param {string} eventName - Name of the custom event
 * @param {any} options - Passed to the CustomEvent construcor
 */
function emitCustomEvent(element, eventName, options) {
  const evt = new CustomEvent(eventName, options)
  element.dispatchEvent(evt);
}

/**
 * Creates an event listener on the given element that only executes after
 * subsequent events have stopped emitting for `delay` ms.
 * 
 * This is a useful alternative to standard event handlers that perform heavy
 * tasks.
 * 
 * @param {Node} node - DOM node to attach listener to
 * @param {string} eventName - Name of the event to listen for
 * @param {function} cb - Callback function to execute after events have stopped
 *    firing
 * @param {*} delay - Time in between events to wait before the action is
 *    considered finished
 */
function createDelayedListener(node, eventName, cb, delay) {
  let resizeTimer = null;

  cb = cb || (() => null);
  delay = delay == null ? 100 : delay;

  const fn = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(cb, delay)
  };

  node.addEventListener(eventName, fn);

  return fn;
}

function removeDelayedListener(node, eventName, fn) {
  node.removeEventListener(eventName, fn);
}

/**
 *    POLYFILLS...if necessary..... (cough cough Internet Explorer)
 */

if (!Object.assign) {
  Object.assign = function (destObj) {
    if (typeof destObj !== 'object') {
      throw new TypeError('first argument should be an object');
    }

    const srcObjs = Array.from(arguments).slice(1);

    srcObjs.forEach((srcObj) => {
      for (const key in srcObj) {
        if (srcObj[key] !== undefined) {
          destObj[key] = srcObj[key];
        }
      }
    });

    return destObj;
  };
}

// Taken from https://developer.mozilla.org/en-US/docs/Web/API/Element/closest#Polyfill
if (!Element.prototype.matches) {
  Element.prototype.matches =
    Element.prototype.msMatchesSelector ||
    Element.prototype.webkitMatchesSelector;
}

if (!Element.prototype.closest) {
  Element.prototype.closest = function(s) {
    var el = this;

    do {
      if (Element.prototype.matches.call(el, s)) return el;
      el = el.parentElement || el.parentNode;
    } while (el !== null && el.nodeType === 1);
    return null;
  };
}

// Taken from https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent#Polyfill
(function () {
  if ( typeof window.CustomEvent === "function" ) return false;

  function CustomEvent ( event, params ) {
    params = params || { bubbles: false, cancelable: false, detail: null };
    var evt = document.createEvent( 'CustomEvent' );
    evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );
    return evt;
   }

  window.CustomEvent = CustomEvent;
})();
