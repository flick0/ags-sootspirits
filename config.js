import { Furnance } from "./soot.js"

const Bar = (/** @type {number} */ monitor) => Widget.Window({
    monitor,
    css: 'all: unset;',
    layer: 'bottom',
    name: `soot${monitor}`,
    anchor: ['top', 'left', 'right', 'bottom'],
    exclusivity: 'ignore',
    child: Furnance({
        chase: Variable([], {})
    }),
    setup: (self) => {
        print("starting...")
    }
})

export default {
    windows: [
        Bar(0)
    ]
}