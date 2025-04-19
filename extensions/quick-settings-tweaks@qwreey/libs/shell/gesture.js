import St from "gi://St";
import Clutter from "gi://Clutter";
// #region Drag
export class Drag extends St.Bin {
    _dragStart(event) {
        if (this._dragging)
            return Clutter.EVENT_PROPAGATE;
        this._dragging = true;
        this._dragIsClick = true;
        this._dragStartCoords = event.get_coords();
        this._grabbedDevice = event.get_device();
        this._grabbedSequence = event.get_event_sequence();
        // @ts-expect-error Types not implemented
        this._grab = global.stage.grab(this);
        const dragEvent = event;
        dragEvent.isClick = true;
        dragEvent.startCoords = this._dragStartCoords;
        dragEvent.coords = this._dragStartCoords;
        dragEvent.moveStartCoords = this._dragMoveStartCoords;
        if (this.dfunc_drag_start)
            this.dfunc_drag_start(dragEvent);
        return Clutter.EVENT_STOP;
    }
    _dragEnd(event) {
        if (!this._dragging) {
            return Clutter.EVENT_PROPAGATE;
        }
        if (this._grab) {
            this._grab.dismiss();
            this._grab = null;
        }
        this._grabbedSequence = null;
        this._grabbedDevice = null;
        this._dragging = false;
        const coords = event.get_coords();
        this._checkDragIsClick(coords);
        const dragEvent = event;
        dragEvent.isClick = this._dragIsClick;
        dragEvent.startCoords = this._dragStartCoords;
        dragEvent.coords = coords;
        dragEvent.moveStartCoords = this._dragMoveStartCoords;
        this._dragStartCoords =
            this._dragMoveStartCoords = null;
        if (this.dfunc_drag_end)
            this.dfunc_drag_end(dragEvent);
        return Clutter.EVENT_STOP;
    }
    _dragMotion(event) {
        const coords = event.get_coords();
        this._checkDragIsClick(coords);
        const dragEvent = event;
        dragEvent.isClick = this._dragIsClick;
        dragEvent.startCoords = this._dragStartCoords;
        dragEvent.coords = coords;
        dragEvent.moveStartCoords = this._dragMoveStartCoords;
        if (this.dfunc_drag_motion)
            this.dfunc_drag_motion(dragEvent);
        return Clutter.EVENT_STOP;
    }
    _checkDragIsClick(coords) {
        if (!this._dragIsClick)
            return;
        if (Drag.getCoordsDistanceSquare(coords, this._dragStartCoords) > Drag.DragMinPixelSquare) {
            this._dragMoveStartCoords = coords;
            this._dragIsClick = false;
        }
    }
    vfunc_button_press_event(event) {
        return this._dragStart(event);
    }
    vfunc_button_release_event(event) {
        return this._dragEnd(event);
    }
    vfunc_touch_event(event) {
        const sequence = event.get_event_sequence();
        const slotSame = this._grabbedSequence && sequence.get_slot() === this._grabbedSequence.get_slot();
        switch (event.type()) {
            case Clutter.EventType.TOUCH_BEGIN:
                return this._dragStart(event);
            case Clutter.EventType.TOUCH_UPDATE:
                if (!slotSame)
                    return Clutter.EVENT_PROPAGATE;
                return this._dragMotion(event);
            case Clutter.EventType.TOUCH_END:
                if (!slotSame)
                    return Clutter.EVENT_PROPAGATE;
                return this._dragEnd(event);
        }
        return Clutter.EVENT_PROPAGATE;
    }
    vfunc_motion_event(event) {
        if (this._dragging && !this._grabbedSequence) {
            return this._dragMotion(event);
        }
        return Clutter.EVENT_PROPAGATE;
    }
    static applyTo(widgetClass) {
        const widgetProto = widgetClass.prototype;
        const dragProto = Drag.prototype;
        for (const methodName of Object.getOwnPropertyNames(dragProto)) {
            Object.defineProperty(widgetProto, methodName, {
                value: dragProto[methodName],
                configurable: true,
                writable: true,
            });
        }
    }
    static getCoordsDistanceSquare(coordsA, coordsB) {
        const [ax, ay] = coordsA;
        const [bx, by] = coordsB;
        const xdist = ax - bx;
        const ydist = ay - by;
        return xdist * xdist + ydist * ydist;
    }
}
(function (Drag) {
    Drag.DragMinPixel = 6;
    Drag.DragMinPixelSquare = Drag.DragMinPixel * Drag.DragMinPixel;
})(Drag || (Drag = {}));
// #endregion Drag
// #region Scroll
export class Scroll extends St.Bin {
    vfunc_scroll_event(event) {
        if (event.get_scroll_direction() != Clutter.ScrollDirection.SMOOTH
            || event.get_scroll_source() == Clutter.ScrollSource.WHEEL)
            return Clutter.EVENT_PROPAGATE;
        const finish = event.get_scroll_finish_flags();
        const [dx, dy] = event.get_scroll_delta();
        if (!this._scrolling) {
            this._scrolling = true;
            this._scrollSumX = dx;
            this._scrollSumY = dy;
            if (this.dfunc_scroll_start) {
                const scrollEvent = event;
                scrollEvent.scrollSumX = dx;
                scrollEvent.scrollSumY = dy;
                scrollEvent.dx = dx;
                scrollEvent.dy = dy;
                this.dfunc_scroll_start(scrollEvent);
            }
        }
        else {
            this._scrollSumX += dx;
            this._scrollSumY += dy;
            if (this.dfunc_scroll_motion) {
                const scrollEvent = event;
                scrollEvent.scrollSumX = this._scrollSumX;
                scrollEvent.scrollSumY = this._scrollSumY;
                scrollEvent.dx = dx;
                scrollEvent.dy = dy;
                this.dfunc_scroll_motion(scrollEvent);
            }
        }
        if (finish != Clutter.ScrollFinishFlags.NONE) {
            this._scrolling = false;
            if (this.dfunc_scroll_end) {
                const scrollEvent = event;
                scrollEvent.scrollSumX = this._scrollSumX;
                scrollEvent.scrollSumY = this._scrollSumY;
                scrollEvent.dx = dx;
                scrollEvent.dy = dy;
                scrollEvent.finish = finish;
                this.dfunc_scroll_end(scrollEvent);
            }
        }
    }
    static applyTo(widgetClass) {
        const widgetProto = widgetClass.prototype;
        const scrollProto = Scroll.prototype;
        for (const methodName of Object.getOwnPropertyNames(scrollProto)) {
            Object.defineProperty(widgetProto, methodName, {
                value: scrollProto[methodName],
                configurable: true,
                writable: true,
            });
        }
    }
}
// #endregion Scroll
