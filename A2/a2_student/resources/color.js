

/**
 * Converts an RGB color value to its Hexadecimal representation. 
 * Assumes r, g, and b are contained in the set [0, 1] and
 * returns a hex-value prefixed with #.
 *
 * @param   array rgb       array rgb [r,g,b]
 * @return  string          Hexadecimal representation
 */
function rgbToHex(rgb) {
     let   r = Math.round(rgb[0] * 255);     
     let   g = Math.round(rgb[1] * 255);
     let   b = Math.round(rgb[2] * 255);
     r = (r <= 16) ? "0".concat(r.toString(16)) : r.toString(16);
     g = (g <= 16) ? "0".concat(g.toString(16)) : g.toString(16);
     b = (b <= 16) ? "0".concat(b.toString(16)) : b.toString(16);
    
    return "#".concat(r, g, b);
}

/**
 * Converts a hexadecimal color value to its [r, g, b] representation. 
 * Assumes r, g, and b are contained in the set [0, 1] and
 * returns an array of these values
 *
 * @param  string           Hexadecimal representation
 * @return  Array           The RGB representation
 */
function hexToRgb(hex) {
    const r = parseInt(hex.substring(1, 3), 16) / 255.0;
    const g = parseInt(hex.substring(3, 5), 16) / 255.0;
    const b = parseInt(hex.substring(5, 7), 16) / 255.0;
    return [r, g, b];
}



/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 1] and
 * returns h, s, and l in the set [0, 1].
 *
* @param    array rgb       array rgb [r,g,b]
 * @return  Array           The HSL representation
 */
function rgbToHsl(rgb) {

    const r = rgb[0];
    const g = rgb[1];
    const b = rgb[2];
    
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if (max == min) {
        h = s = 0; // achromatic
    } else {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }

        h /= 6;
    }

    return [h, s, l];
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 1].
 *
 * @param   Array hsl       The hsl color as [h,s,l]
 * @return  Array           The RGB representation
 */
function hslToRgb(hsl) {
    
    const h = hsl[0];
    const s = hsl[1];
    const l = hsl[2];
    
    var r, g, b;

    if (s == 0) {
        r = g = b = l; // achromatic
    } else {
        function hue2rgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;

        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [r, g, b];
}

/**
 * Converts an RGB color value to HSV. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
 * Assumes r, g, and b are contained in the set [0, 1] and
 * returns h, s, and v in the set [0, 1].
 *
 * @param   Array rgb       The rgb color as [r,g,b]
 * @return  Array           The HSV representation
 */
function rgbToHsv(rgb) {

    const r = rgb[0];
    const g = rgb[1];
    const b = rgb[2];

    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, v = max;

    var d = max - min;
    s = max == 0 ? 0 : d / max;

    if (max == min) {
        h = 0; // achromatic
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }

        h /= 6;
    }

    return [h, s, v];
}

/**
 * Converts an HSV color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
 * Assumes h, s, and v are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 1].
 *
 * @param   array hsv       The hsv color as [h,s,v]
 * @return  Array           The RGB representation
 */
function hsvToRgb(hsv) {
    
    const h = hsv[0];
    const s = hsv[1];
    const v = hsv[2];
    
    var r, g, b;

    var i = Math.floor(h * 6);
    var f = h * 6 - i;
    var p = v * (1 - s);
    var q = v * (1 - f * s);
    var t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }

    return [r, g, b];
}