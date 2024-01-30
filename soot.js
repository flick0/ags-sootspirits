import Hyprland from 'resource:///com/github/Aylur/ags/service/hyprland.js';

import Cairo from 'cairo';

const get_cursor = async () => {
    return Hyprland.sendMessage("cursorpos").then((pos) => {
        return pos.split(',').map((x) => parseInt(x))
    })
}

const rand_int = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const rand_float = (min, max) => {
    return Math.random() * (max - min) + min;
}

const SCREEN_WIDTH = Number(
    Utils.exec(
      `bash -c "xrandr --current | grep '*' | uniq | awk '{print $1}' | cut -d 'x' -f1 | head -1"`
    )
);

const SCREEN_HEIGHT = Number(
  Utils.exec(
    `bash -c "xrandr --current | grep '*' | uniq | awk '{print $1}' | cut -d 'x' -f2 | head -1"`
  )
);

let prev_regions = []
let prev_regions_time = 0

const get_window_regions = () => {
    if (Date.now() - prev_regions_time < 100) return prev_regions;
    let regions = []
    try{
        let clients = Utils.exec("hyprctl clients -j")
        clients = JSON.parse(clients)
        for (let client of clients) {
            if (client.workspace.id !== Hyprland.active.workspace.id) continue;

            let [x, y] = client.at
            let [width, height] = client.size
            let [x2, y2] = [x + width, y + height]

            if (x < 0) x = 0
            if (y < 0) y = 0
            if (x2 > SCREEN_WIDTH) x2 = SCREEN_WIDTH
            if (y2 > SCREEN_HEIGHT) y2 = SCREEN_HEIGHT

            regions.push([x, y, x2, y2])
        }
    }catch (e) {print("error",e)}
    prev_regions = regions
    prev_regions_time = Date.now()
    return regions
}

const FPS = 60
const MIN_RADIUS = 30
const MAX_RADIUS = 50

class Soot {
    constructor(invis = false) {
        this.x = 0
        this.y = 0
        this.to_x = 0
        this.to_y = 0
        this.radius = invis?MAX_RADIUS:rand_int(MIN_RADIUS,MAX_RADIUS)
        this.color = [0, 0, 0]
        this.highlightcolor = [0.1, 0.1, 0.1]
        this.hairs = Array.from({length: rand_int(50,100)}, () => [rand_float(0,0.1), rand_float(1, 5)])
        this.invisible = invis

        this.outer_gradient_stop = 0.7
        this.inner_gradient_stop = 0.5

        this.pupil_size = 0.1
        this.shadow_radius = this.radius/2

        // speed out of 1000
        this.max_speed = 1000 / (this.radius * 100)

        this.drag = 0.2 * (this.radius / MAX_RADIUS)

        this._x_speed = 10
        this._y_speed = 0        

        // actual speed after accomodating for fps
        this._max_speed = (1000-this.max_speed) / (1000/FPS)

        this._max_dist = Math.sqrt(SCREEN_WIDTH * SCREEN_WIDTH + SCREEN_HEIGHT * SCREEN_HEIGHT)

        this.random_time = 0
        this.style_time = 0
    }

    update(all_soots) {
        if (this.invisible) {
            this.x = this.to_x
            this.y = this.to_y
            return
        }
        let dx = this.to_x - this.x
        let dy = this.to_y - this.y

        this._x_speed += dx / this._max_speed
        this._y_speed += dy / this._max_speed

        this._x_speed *= 1 - this.drag
        this._y_speed *= 1 - this.drag

        if (Date.now() - this.style_time > 1000/4) {
            this.inner_gradient_stop = rand_float(0.5, 0.7)
            this.outer_gradient_stop = rand_float(0.5, 0.8)
            this.hairs = Array.from({length: rand_int(50,100)}, () => [rand_float(0,0.1), rand_float(0, 5)])
            this.shadow_radius = this.radius/2 * rand_float(0.5, 1.5)
            this.style_time = Date.now()
        }

        // randomness
        if (Date.now() - this.random_time > rand_int(300, 700)) {
            this._x_speed += rand_float(-2, 2)
            this._y_speed += rand_float(-2, 2)
            this.random_time = Date.now()
        }

        let dist = Math.sqrt(dx * dx + dy * dy)
        let size = 0.1 + (100 - dist) / 500
        if (size > 0.05){
            this.pupil_size = size
        } else {
            this.pupil_size = 0.5
        }

        // social distancing ie: don't get too close to other soots
        for (let soot of all_soots) {
            if (soot === this) continue;

            let dx = soot.x - this.x
            let dy = soot.y - this.y

            let dist = Math.sqrt(dx * dx + dy * dy)

            if (dist < this.radius + soot.radius) {
                let angle = Math.atan2(dy, dx)
                let force = (this.radius + soot.radius) - dist

                this._x_speed -= Math.cos(angle) * force * this.drag
                this._y_speed -= Math.sin(angle) * force * this.drag
            }
        }

        if (this.x < this.radius) {
            this._x_speed += 1
        }
        if (this.x > SCREEN_WIDTH - this.radius) {
            this._x_speed -= 1
        }
        if (this.y < this.radius) {
            this._y_speed += 1
        }
        if (this.y > SCREEN_HEIGHT - this.radius) {
            this._y_speed -= 1
        }

        for (let region of get_window_regions()) {
            let [x, y, x2, y2] = region

            if (this.x > x - this.radius && this.x < x2 + this.radius && this.y > y - this.radius && this.y < y2 + this.radius) {
                let dx = this.x - (x + x2) / 2
                let dy = this.y - (y + y2) / 2

                let angle = Math.atan2(dy, dx)

                let dist_from_edge = Math.min(
                    Math.abs(this.x - (x - 2*this.radius)),
                    Math.abs(this.x - (x2 + 2*this.radius)),
                    Math.abs(this.y - (y - 2*this.radius)),
                    Math.abs(this.y - (y2 + 2*this.radius))
                )
                let force = (this.radius + 10) - 1.5*dist_from_edge

                this._x_speed -= Math.cos(angle) * force * this.drag
                this._y_speed -= Math.sin(angle) * force * this.drag
            }
        }

        this.x += this._x_speed
        this.y += this._y_speed
    }

    draw(ctx) {
        if (this.invisible) {
            let star_color = [248/255, 200/255, 220/255]
            let star_outline = [105/255, 77/255, 96/255]

            let star_radius = 15
            let star_points = 5

            ctx.setSourceRGBA(...star_color,1)
            ctx.moveTo(this.x + star_radius, this.y)
            for (let i = 0; i < star_points; i++) {
                let angle = Math.PI * 2 * (i / star_points)
                ctx.lineTo(this.x + Math.cos(angle) * star_radius, this.y + Math.sin(angle) * star_radius)
            }
            ctx.fill()

            ctx.setSourceRGBA(...star_outline,1)
            ctx.moveTo(this.x + star_radius, this.y)
            for (let i = 0; i < star_points; i++) {
                let angle = Math.PI * 2 * (i / star_points)
                ctx.lineTo(this.x + Math.cos(angle) * star_radius, this.y + Math.sin(angle) * star_radius)
            }
            ctx.setLineWidth(3)
            ctx.stroke()
            return
        }
        // print("drawing soot")
        
        // body
        let pattern = new Cairo.RadialGradient(this.x, this.y, 0, this.x, this.y, this.radius)
        pattern.addColorStopRGBA(0, ...this.color, 1)
        pattern.addColorStopRGBA(this.outer_gradient_stop, ...this.color, 1)
        pattern.addColorStopRGBA(1, ...this.color, 0)
        ctx.setSource(pattern)
    
        ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI)
        ctx.fill()
        
        // hairs
        this.hairs.forEach((hairdat,i) => {
            let [angle_offset, length] = hairdat;

            let angle = Math.PI * 2 * (i / this.hairs.length) + angle_offset
            let x = this.x + Math.cos(angle) * (this.radius + length)
            let y = this.y + Math.sin(angle) * (this.radius + length)

            ctx.setSourceRGBA(...this.color, 1)
            ctx.moveTo(this.x, this.y)
            ctx.lineTo(x, y)
            ctx.setLineWidth(1)
            ctx.stroke()
        })

        ctx.fill()

        // lighter center gradient
        pattern = new Cairo.RadialGradient(this.x, this.y, 0, this.x, this.y, this.radius)
        pattern.addColorStopRGBA(0, ...this.highlightcolor, 1)
        pattern.addColorStopRGBA(this.inner_gradient_stop, ...this.highlightcolor, 1)
        pattern.addColorStopRGBA(1, ...this.highlightcolor, 0)
        ctx.setSource(pattern)

        ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI)
        ctx.fill()

        let angle = Math.atan2(this.to_y - this.y, this.to_x - this.x)

        // eyes

        let eye_color = [1,1,1]
        let pupil_color = [0,0,0]

        
        if (this.pupil_size < 0.3) {
            // outer
            ctx.setSourceRGBA(...eye_color, 1);
            ctx.save();
            ctx.translate(this.x + Math.cos(angle) * (this.radius / 2), this.y + Math.sin(angle) * (this.radius / 2));

            // squish based on angle
            ctx.scale(1, Math.abs(Math.sin(angle)) + 0.5)

            // outer 1
            ctx.arc(0, 0, this.radius / 5, 0, 2 * Math.PI);

            // outer 2
            ctx.translate(this.radius / 2, 0);
            ctx.arc(0, 0, this.radius / 5, 0, 2 * Math.PI);

            ctx.restore();
            ctx.fill();


            // pupil
            ctx.setSourceRGBA(...pupil_color, 1);
            ctx.save();
            ctx.translate(this.x + Math.cos(angle) * (this.radius / 2), this.y + Math.sin(angle) * (this.radius / 2));

            // squish based on angle
            ctx.scale(1, Math.abs(Math.sin(angle)) + 0.5)

            // inner 1
            let look_angle = Math.atan2(this.to_y - this.y, this.to_x - this.x)
            ctx.translate(Math.cos(look_angle) * (this.radius / 10), Math.sin(look_angle) * (this.radius / 10));
            ctx.arc(0, 0, this.radius * this.pupil_size, 0, 2 * Math.PI);

            // inner 2
            ctx.translate(this.radius / 2, 0);
            ctx.arc(0, 0, this.radius * this.pupil_size, 0, 2 * Math.PI);

            ctx.restore();
            ctx.fill();
        }

        // shadow
        ctx.setSourceRGBA(0, 0, 0, 0.1);
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, 0.3);
        ctx.arc(0, this.radius/0.3 + 10/0.3, this.shadow_radius, 0, 2 * Math.PI);
        ctx.restore();
        ctx.fill();

    }
}

export const Furnance = ({
    all_soots = [new Soot(true), ...Array.from({length: 5}, () => new Soot())],
    chase = Variable([], {})
}) => Widget.DrawingArea({
    css: 'all: unset;',
    class_name: 'furnance',
}).on('draw', (self, ctx) => {
    for (let soot of all_soots) {
        // print("found soot")
        soot.draw(ctx);
    }
}).poll(1000/FPS, async (self) => {
    try {
        for (let soot of all_soots) {
            soot.update(all_soots);
            
        }
        self.queue_draw()
    }catch (e) {
        print(e)
    }
    //cursor pos
})
.poll(1000/FPS, async (self) => {
    try {
        let [x,y] = await get_cursor()
        let first_soot = all_soots[0]
        first_soot.to_x = x
        first_soot.to_y = y
        for (let soot of all_soots) {
            let dist_to_cursor = Math.sqrt((soot.x - x) ** 2 + (soot.y - y) ** 2)
            Utils.timeout(dist_to_cursor / soot._max_dist * 1000, () =>{
                soot.to_x = x
                soot.to_y = y
            })
        }        
    }catch (e) {
        print(e)
    }
    //cursor pos
})