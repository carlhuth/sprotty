import {CommandStackCallback} from "../intent/CommandStack"
import {GModelRoot, GModelElement} from "../model/GModel"
import {EventSource} from "../../utils/Utils"
import {Action} from "../intent/Actions"
import {h, init} from "snabbdom"
import {VNode} from "snabbdom/vnode"
import {Module} from "snabbdom/modules/module"
import {classModule} from "snabbdom/modules/class"
import {propsModule} from "snabbdom/modules/props"
import {attributesModule} from "snabbdom/modules/attributes"
import {styleModule} from "snabbdom/modules/style"
import {eventListenersModule} from "snabbdom/modules/eventlisteners"
import {AddRemoveAnimationDecorator, VNodeDecorator} from "./VNodeDecorators"
import {RenderingContext, ViewRegistry} from "./Views"
import {KeyTool} from "./KeyTool"
import {MouseTool} from "./MouseTool"

/**
 * The component that turns the model into an SVG DOM.
 * Uses a VDOM based on snabbdom.js for performance.
 */
export class Viewer extends EventSource<ViewerCallback> implements CommandStackCallback, VNodeDecorator {

    viewComponentRegistry = new ViewRegistry()
    patcher: Patcher
    lastVDOM: undefined
    decorators: VNodeDecorator[] = []

    constructor() {
        super()
        this.patcher = this.createPatcher()
        this.decorators = this.createDecorators()
    }

    createDecorators(): VNodeDecorator[] {
        return [new AddRemoveAnimationDecorator(), new KeyTool(this), new MouseTool(this)]
    }

    createModules(): Module[] {
        return [
            classModule,
            propsModule,
            attributesModule,
            styleModule,
            eventListenersModule
        ]
    }

    createPatcher() {
        return init(this.createModules())
    }

    createRenderingContext(model: GModelRoot): RenderingContext {
        return {
            viewRegistry: this.viewComponentRegistry,
            viewer: this,
            root: model
        }
    }

    decorate(vnode: VNode, element: GModelElement): VNode {
        return this.decorators.reduce(
            (vnode: VNode, decorator: VNodeDecorator) => decorator.decorate(vnode, element),
            vnode)
    }

    update(model: GModelRoot): void {
        const context = this.createRenderingContext(model)
        const newVDOM = h('div', {
            attrs: {
                id: 'malzeit'
            }
        }, [
            this.decorate(this.viewComponentRegistry.get(model.type, model).render(model, context), model)
        ])
        if (this.lastVDOM) {
            this.lastVDOM = this.patcher.call(this, this.lastVDOM, newVDOM)
        } else {
            const placeholder = document.getElementById('malzeit')
            this.lastVDOM = this.patcher.call(this, placeholder, newVDOM)
        }
    }

    fireAction(action: Action) {
        this.callbacks.forEach(callback => callback.execute([action]))
    }
}

export type Patcher = (oldRoot: VNode | Element, newRoot: VNode) => VNode

export interface ViewerCallback {
    execute(actions: Action[]): void
}

