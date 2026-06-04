import { n as __toESM } from "./chunk-FDOR9p9I.js";
import { Bt as j, Xn as require_maplibre_gl } from "./maptiler-sdk-DlqjlFu0.js";
//#region node_modules/@lit/reactive-element/development/css-tag.js
/**
* @license
* Copyright 2019 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var NODE_MODE = false;
var global$3 = globalThis;
/**
* Whether the current browser supports `adoptedStyleSheets`.
*/
var supportsAdoptingStyleSheets = global$3.ShadowRoot && (global$3.ShadyCSS === void 0 || global$3.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var constructionToken = Symbol();
var cssTagCache = /* @__PURE__ */ new WeakMap();
/**
* A container for a string of CSS text, that may be used to create a CSSStyleSheet.
*
* CSSResult is the return value of `css`-tagged template literals and
* `unsafeCSS()`. In order to ensure that CSSResults are only created via the
* `css` tag and `unsafeCSS()`, CSSResult cannot be constructed directly.
*/
var CSSResult = class {
	constructor(cssText, strings, safeToken) {
		this["_$cssResult$"] = true;
		if (safeToken !== constructionToken) throw new Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
		this.cssText = cssText;
		this._strings = strings;
	}
	get styleSheet() {
		let styleSheet = this._styleSheet;
		const strings = this._strings;
		if (supportsAdoptingStyleSheets && styleSheet === void 0) {
			const cacheable = strings !== void 0 && strings.length === 1;
			if (cacheable) styleSheet = cssTagCache.get(strings);
			if (styleSheet === void 0) {
				(this._styleSheet = styleSheet = new CSSStyleSheet()).replaceSync(this.cssText);
				if (cacheable) cssTagCache.set(strings, styleSheet);
			}
		}
		return styleSheet;
	}
	toString() {
		return this.cssText;
	}
};
var textFromCSSResult = (value) => {
	if (value["_$cssResult$"] === true) return value.cssText;
	else if (typeof value === "number") return value;
	else throw new Error(`Value passed to 'css' function must be a 'css' function result: ${value}. Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.`);
};
/**
* Wrap a value for interpolation in a {@linkcode css} tagged template literal.
*
* This is unsafe because untrusted CSS text can be used to phone home
* or exfiltrate data to an attacker controlled site. Take care to only use
* this with trusted input.
*/
var unsafeCSS = (value) => new CSSResult(typeof value === "string" ? value : String(value), void 0, constructionToken);
/**
* A template literal tag which can be used with LitElement's
* {@linkcode LitElement.styles} property to set element styles.
*
* For security reasons, only literal string values and number may be used in
* embedded expressions. To incorporate non-literal values {@linkcode unsafeCSS}
* may be used inside an expression.
*/
var css = (strings, ...values) => {
	return new CSSResult(strings.length === 1 ? strings[0] : values.reduce((acc, v, idx) => acc + textFromCSSResult(v) + strings[idx + 1], strings[0]), strings, constructionToken);
};
/**
* Applies the given styles to a `shadowRoot`. When Shadow DOM is
* available but `adoptedStyleSheets` is not, styles are appended to the
* `shadowRoot` to [mimic the native feature](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/adoptedStyleSheets).
* Note, when shimming is used, any styles that are subsequently placed into
* the shadowRoot should be placed *before* any shimmed adopted styles. This
* will match spec behavior that gives adopted sheets precedence over styles in
* shadowRoot.
*/
var adoptStyles = (renderRoot, styles) => {
	if (supportsAdoptingStyleSheets) renderRoot.adoptedStyleSheets = styles.map((s) => s instanceof CSSStyleSheet ? s : s.styleSheet);
	else for (const s of styles) {
		const style = document.createElement("style");
		const nonce = global$3["litNonce"];
		if (nonce !== void 0) style.setAttribute("nonce", nonce);
		style.textContent = s.cssText;
		renderRoot.appendChild(style);
	}
};
var cssResultFromStyleSheet = (sheet) => {
	let cssText = "";
	for (const rule of sheet.cssRules) cssText += rule.cssText;
	return unsafeCSS(cssText);
};
var getCompatibleStyle = supportsAdoptingStyleSheets || NODE_MODE ? (s) => s : (s) => s instanceof CSSStyleSheet ? cssResultFromStyleSheet(s) : s;
//#endregion
//#region node_modules/@lit/reactive-element/development/reactive-element.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
/**
* Use this module if you want to create your own base class extending
* {@link ReactiveElement}.
* @packageDocumentation
*/
var { is, defineProperty, getOwnPropertyDescriptor, getOwnPropertyNames, getOwnPropertySymbols, getPrototypeOf } = Object;
var global$2 = globalThis;
var issueWarning$4;
var trustedTypes$1 = global$2.trustedTypes;
var emptyStringForBooleanAttribute = trustedTypes$1 ? trustedTypes$1.emptyScript : "";
var polyfillSupport$2 = global$2.reactiveElementPolyfillSupportDevMode;
global$2.litIssuedWarnings ??= /* @__PURE__ */ new Set();
/**
* Issue a warning if we haven't already, based either on `code` or `warning`.
* Warnings are disabled automatically only by `warning`; disabling via `code`
* can be done by users.
*/
issueWarning$4 = (code, warning) => {
	warning += ` See https://lit.dev/msg/${code} for more information.`;
	if (!global$2.litIssuedWarnings.has(warning) && !global$2.litIssuedWarnings.has(code)) {
		console.warn(warning);
		global$2.litIssuedWarnings.add(warning);
	}
};
queueMicrotask(() => {
	issueWarning$4("dev-mode", `Lit is in dev mode. Not recommended for production!`);
	if (global$2.ShadyDOM?.inUse && polyfillSupport$2 === void 0) issueWarning$4("polyfill-support-missing", "Shadow DOM is being polyfilled via `ShadyDOM` but the `polyfill-support` module has not been loaded.");
});
/**
* Useful for visualizing and logging insights into what the Lit template system is doing.
*
* Compiled out of prod mode builds.
*/
var debugLogEvent$1 = (event) => {
	if (!global$2.emitLitDebugLogEvents) return;
	global$2.dispatchEvent(new CustomEvent("lit-debug", { detail: event }));
};
var JSCompiler_renameProperty$1 = (prop, _obj) => prop;
var defaultConverter = {
	toAttribute(value, type) {
		switch (type) {
			case Boolean:
				value = value ? emptyStringForBooleanAttribute : null;
				break;
			case Object:
			case Array:
				value = value == null ? value : JSON.stringify(value);
				break;
		}
		return value;
	},
	fromAttribute(value, type) {
		let fromValue = value;
		switch (type) {
			case Boolean:
				fromValue = value !== null;
				break;
			case Number:
				fromValue = value === null ? null : Number(value);
				break;
			case Object:
			case Array:
				try {
					fromValue = JSON.parse(value);
				} catch (e) {
					fromValue = null;
				}
				break;
		}
		return fromValue;
	}
};
/**
* Change function that returns true if `value` is different from `oldValue`.
* This method is used as the default for a property's `hasChanged` function.
*/
var notEqual = (value, old) => !is(value, old);
var defaultPropertyDeclaration$1 = {
	attribute: true,
	type: String,
	converter: defaultConverter,
	reflect: false,
	useDefault: false,
	hasChanged: notEqual
};
Symbol.metadata ??= Symbol("metadata");
global$2.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
/**
* Base element class which manages element properties and attributes. When
* properties change, the `update` method is asynchronously called. This method
* should be supplied by subclasses to render updates as desired.
* @noInheritDoc
*/
var ReactiveElement = class extends HTMLElement {
	/**
	* Adds an initializer function to the class that is called during instance
	* construction.
	*
	* This is useful for code that runs against a `ReactiveElement`
	* subclass, such as a decorator, that needs to do work for each
	* instance, such as setting up a `ReactiveController`.
	*
	* ```ts
	* const myDecorator = (target: typeof ReactiveElement, key: string) => {
	*   target.addInitializer((instance: ReactiveElement) => {
	*     // This is run during construction of the element
	*     new MyController(instance);
	*   });
	* }
	* ```
	*
	* Decorating a field will then cause each instance to run an initializer
	* that adds a controller:
	*
	* ```ts
	* class MyElement extends LitElement {
	*   @myDecorator foo;
	* }
	* ```
	*
	* Initializers are stored per-constructor. Adding an initializer to a
	* subclass does not add it to a superclass. Since initializers are run in
	* constructors, initializers will run in order of the class hierarchy,
	* starting with superclasses and progressing to the instance's class.
	*
	* @nocollapse
	*/
	static addInitializer(initializer) {
		this.__prepare();
		(this._initializers ??= []).push(initializer);
	}
	/**
	* Returns a list of attributes corresponding to the registered properties.
	* @nocollapse
	* @category attributes
	*/
	static get observedAttributes() {
		this.finalize();
		return this.__attributeToPropertyMap && [...this.__attributeToPropertyMap.keys()];
	}
	/**
	* Creates a property accessor on the element prototype if one does not exist
	* and stores a {@linkcode PropertyDeclaration} for the property with the
	* given options. The property setter calls the property's `hasChanged`
	* property option or uses a strict identity check to determine whether or not
	* to request an update.
	*
	* This method may be overridden to customize properties; however,
	* when doing so, it's important to call `super.createProperty` to ensure
	* the property is setup correctly. This method calls
	* `getPropertyDescriptor` internally to get a descriptor to install.
	* To customize what properties do when they are get or set, override
	* `getPropertyDescriptor`. To customize the options for a property,
	* implement `createProperty` like this:
	*
	* ```ts
	* static createProperty(name, options) {
	*   options = Object.assign(options, {myOption: true});
	*   super.createProperty(name, options);
	* }
	* ```
	*
	* @nocollapse
	* @category properties
	*/
	static createProperty(name, options = defaultPropertyDeclaration$1) {
		if (options.state) options.attribute = false;
		this.__prepare();
		if (this.prototype.hasOwnProperty(name)) {
			options = Object.create(options);
			options.wrapped = true;
		}
		this.elementProperties.set(name, options);
		if (!options.noAccessor) {
			const key = Symbol.for(`${String(name)} (@property() cache)`);
			const descriptor = this.getPropertyDescriptor(name, key, options);
			if (descriptor !== void 0) defineProperty(this.prototype, name, descriptor);
		}
	}
	/**
	* Returns a property descriptor to be defined on the given named property.
	* If no descriptor is returned, the property will not become an accessor.
	* For example,
	*
	* ```ts
	* class MyElement extends LitElement {
	*   static getPropertyDescriptor(name, key, options) {
	*     const defaultDescriptor =
	*         super.getPropertyDescriptor(name, key, options);
	*     const setter = defaultDescriptor.set;
	*     return {
	*       get: defaultDescriptor.get,
	*       set(value) {
	*         setter.call(this, value);
	*         // custom action.
	*       },
	*       configurable: true,
	*       enumerable: true
	*     }
	*   }
	* }
	* ```
	*
	* @nocollapse
	* @category properties
	*/
	static getPropertyDescriptor(name, key, options) {
		const { get, set } = getOwnPropertyDescriptor(this.prototype, name) ?? {
			get() {
				return this[key];
			},
			set(v) {
				this[key] = v;
			}
		};
		if (get == null) {
			if ("value" in (getOwnPropertyDescriptor(this.prototype, name) ?? {})) throw new Error(`Field ${JSON.stringify(String(name))} on ${this.name} was declared as a reactive property but it's actually declared as a value on the prototype. Usually this is due to using @property or @state on a method.`);
			issueWarning$4("reactive-property-without-getter", `Field ${JSON.stringify(String(name))} on ${this.name} was declared as a reactive property but it does not have a getter. This will be an error in a future version of Lit.`);
		}
		return {
			get,
			set(value) {
				const oldValue = get?.call(this);
				set?.call(this, value);
				this.requestUpdate(name, oldValue, options);
			},
			configurable: true,
			enumerable: true
		};
	}
	/**
	* Returns the property options associated with the given property.
	* These options are defined with a `PropertyDeclaration` via the `properties`
	* object or the `@property` decorator and are registered in
	* `createProperty(...)`.
	*
	* Note, this method should be considered "final" and not overridden. To
	* customize the options for a given property, override
	* {@linkcode createProperty}.
	*
	* @nocollapse
	* @final
	* @category properties
	*/
	static getPropertyOptions(name) {
		return this.elementProperties.get(name) ?? defaultPropertyDeclaration$1;
	}
	/**
	* Initializes static own properties of the class used in bookkeeping
	* for element properties, initializers, etc.
	*
	* Can be called multiple times by code that needs to ensure these
	* properties exist before using them.
	*
	* This method ensures the superclass is finalized so that inherited
	* property metadata can be copied down.
	* @nocollapse
	*/
	static __prepare() {
		if (this.hasOwnProperty(JSCompiler_renameProperty$1("elementProperties", this))) return;
		const superCtor = getPrototypeOf(this);
		superCtor.finalize();
		if (superCtor._initializers !== void 0) this._initializers = [...superCtor._initializers];
		this.elementProperties = new Map(superCtor.elementProperties);
	}
	/**
	* Finishes setting up the class so that it's ready to be registered
	* as a custom element and instantiated.
	*
	* This method is called by the ReactiveElement.observedAttributes getter.
	* If you override the observedAttributes getter, you must either call
	* super.observedAttributes to trigger finalization, or call finalize()
	* yourself.
	*
	* @nocollapse
	*/
	static finalize() {
		if (this.hasOwnProperty(JSCompiler_renameProperty$1("finalized", this))) return;
		this.finalized = true;
		this.__prepare();
		if (this.hasOwnProperty(JSCompiler_renameProperty$1("properties", this))) {
			const props = this.properties;
			const propKeys = [...getOwnPropertyNames(props), ...getOwnPropertySymbols(props)];
			for (const p of propKeys) this.createProperty(p, props[p]);
		}
		const metadata = this[Symbol.metadata];
		if (metadata !== null) {
			const properties = litPropertyMetadata.get(metadata);
			if (properties !== void 0) for (const [p, options] of properties) this.elementProperties.set(p, options);
		}
		this.__attributeToPropertyMap = /* @__PURE__ */ new Map();
		for (const [p, options] of this.elementProperties) {
			const attr = this.__attributeNameForProperty(p, options);
			if (attr !== void 0) this.__attributeToPropertyMap.set(attr, p);
		}
		this.elementStyles = this.finalizeStyles(this.styles);
		if (this.hasOwnProperty("createProperty")) issueWarning$4("no-override-create-property", "Overriding ReactiveElement.createProperty() is deprecated. The override will not be called with standard decorators");
		if (this.hasOwnProperty("getPropertyDescriptor")) issueWarning$4("no-override-get-property-descriptor", "Overriding ReactiveElement.getPropertyDescriptor() is deprecated. The override will not be called with standard decorators");
	}
	/**
	* Takes the styles the user supplied via the `static styles` property and
	* returns the array of styles to apply to the element.
	* Override this method to integrate into a style management system.
	*
	* Styles are deduplicated preserving the _last_ instance in the list. This
	* is a performance optimization to avoid duplicated styles that can occur
	* especially when composing via subclassing. The last item is kept to try
	* to preserve the cascade order with the assumption that it's most important
	* that last added styles override previous styles.
	*
	* @nocollapse
	* @category styles
	*/
	static finalizeStyles(styles) {
		const elementStyles = [];
		if (Array.isArray(styles)) {
			const set = new Set(styles.flat(Infinity).reverse());
			for (const s of set) elementStyles.unshift(getCompatibleStyle(s));
		} else if (styles !== void 0) elementStyles.push(getCompatibleStyle(styles));
		return elementStyles;
	}
	/**
	* Returns the property name for the given attribute `name`.
	* @nocollapse
	*/
	static __attributeNameForProperty(name, options) {
		const attribute = options.attribute;
		return attribute === false ? void 0 : typeof attribute === "string" ? attribute : typeof name === "string" ? name.toLowerCase() : void 0;
	}
	constructor() {
		super();
		this.__instanceProperties = void 0;
		/**
		* True if there is a pending update as a result of calling `requestUpdate()`.
		* Should only be read.
		* @category updates
		*/
		this.isUpdatePending = false;
		/**
		* Is set to `true` after the first update. The element code cannot assume
		* that `renderRoot` exists before the element `hasUpdated`.
		* @category updates
		*/
		this.hasUpdated = false;
		/**
		* Name of currently reflecting property
		*/
		this.__reflectingProperty = null;
		this.__initialize();
	}
	/**
	* Internal only override point for customizing work done when elements
	* are constructed.
	*/
	__initialize() {
		this.__updatePromise = new Promise((res) => this.enableUpdating = res);
		this._$changedProperties = /* @__PURE__ */ new Map();
		this.__saveInstanceProperties();
		this.requestUpdate();
		this.constructor._initializers?.forEach((i) => i(this));
	}
	/**
	* Registers a `ReactiveController` to participate in the element's reactive
	* update cycle. The element automatically calls into any registered
	* controllers during its lifecycle callbacks.
	*
	* If the element is connected when `addController()` is called, the
	* controller's `hostConnected()` callback will be immediately called.
	* @category controllers
	*/
	addController(controller) {
		(this.__controllers ??= /* @__PURE__ */ new Set()).add(controller);
		if (this.renderRoot !== void 0 && this.isConnected) controller.hostConnected?.();
	}
	/**
	* Removes a `ReactiveController` from the element.
	* @category controllers
	*/
	removeController(controller) {
		this.__controllers?.delete(controller);
	}
	/**
	* Fixes any properties set on the instance before upgrade time.
	* Otherwise these would shadow the accessor and break these properties.
	* The properties are stored in a Map which is played back after the
	* constructor runs.
	*/
	__saveInstanceProperties() {
		const instanceProperties = /* @__PURE__ */ new Map();
		const elementProperties = this.constructor.elementProperties;
		for (const p of elementProperties.keys()) if (this.hasOwnProperty(p)) {
			instanceProperties.set(p, this[p]);
			delete this[p];
		}
		if (instanceProperties.size > 0) this.__instanceProperties = instanceProperties;
	}
	/**
	* Returns the node into which the element should render and by default
	* creates and returns an open shadowRoot. Implement to customize where the
	* element's DOM is rendered. For example, to render into the element's
	* childNodes, return `this`.
	*
	* @return Returns a node into which to render.
	* @category rendering
	*/
	createRenderRoot() {
		const renderRoot = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
		adoptStyles(renderRoot, this.constructor.elementStyles);
		return renderRoot;
	}
	/**
	* On first connection, creates the element's renderRoot, sets up
	* element styling, and enables updating.
	* @category lifecycle
	*/
	connectedCallback() {
		this.renderRoot ??= this.createRenderRoot();
		this.enableUpdating(true);
		this.__controllers?.forEach((c) => c.hostConnected?.());
	}
	/**
	* Note, this method should be considered final and not overridden. It is
	* overridden on the element instance with a function that triggers the first
	* update.
	* @category updates
	*/
	enableUpdating(_requestedUpdate) {}
	/**
	* Allows for `super.disconnectedCallback()` in extensions while
	* reserving the possibility of making non-breaking feature additions
	* when disconnecting at some point in the future.
	* @category lifecycle
	*/
	disconnectedCallback() {
		this.__controllers?.forEach((c) => c.hostDisconnected?.());
	}
	/**
	* Synchronizes property values when attributes change.
	*
	* Specifically, when an attribute is set, the corresponding property is set.
	* You should rarely need to implement this callback. If this method is
	* overridden, `super.attributeChangedCallback(name, _old, value)` must be
	* called.
	*
	* See [responding to attribute changes](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements#responding_to_attribute_changes)
	* on MDN for more information about the `attributeChangedCallback`.
	* @category attributes
	*/
	attributeChangedCallback(name, _old, value) {
		this._$attributeToProperty(name, value);
	}
	__propertyToAttribute(name, value) {
		const options = this.constructor.elementProperties.get(name);
		const attr = this.constructor.__attributeNameForProperty(name, options);
		if (attr !== void 0 && options.reflect === true) {
			const attrValue = (options.converter?.toAttribute !== void 0 ? options.converter : defaultConverter).toAttribute(value, options.type);
			if (this.constructor.enabledWarnings.includes("migration") && attrValue === void 0) issueWarning$4("undefined-attribute-value", `The attribute value for the ${name} property is undefined on element ${this.localName}. The attribute will be removed, but in the previous version of \`ReactiveElement\`, the attribute would not have changed.`);
			this.__reflectingProperty = name;
			if (attrValue == null) this.removeAttribute(attr);
			else this.setAttribute(attr, attrValue);
			this.__reflectingProperty = null;
		}
	}
	/** @internal */
	_$attributeToProperty(name, value) {
		const ctor = this.constructor;
		const propName = ctor.__attributeToPropertyMap.get(name);
		if (propName !== void 0 && this.__reflectingProperty !== propName) {
			const options = ctor.getPropertyOptions(propName);
			const converter = typeof options.converter === "function" ? { fromAttribute: options.converter } : options.converter?.fromAttribute !== void 0 ? options.converter : defaultConverter;
			this.__reflectingProperty = propName;
			const convertedValue = converter.fromAttribute(value, options.type);
			this[propName] = convertedValue ?? this.__defaultValues?.get(propName) ?? convertedValue;
			this.__reflectingProperty = null;
		}
	}
	/**
	* Requests an update which is processed asynchronously. This should be called
	* when an element should update based on some state not triggered by setting
	* a reactive property. In this case, pass no arguments. It should also be
	* called when manually implementing a property setter. In this case, pass the
	* property `name` and `oldValue` to ensure that any configured property
	* options are honored.
	*
	* @param name name of requesting property
	* @param oldValue old value of requesting property
	* @param options property options to use instead of the previously
	*     configured options
	* @param useNewValue if true, the newValue argument is used instead of
	*     reading the property value. This is important to use if the reactive
	*     property is a standard private accessor, as opposed to a plain
	*     property, since private members can't be dynamically read by name.
	* @param newValue the new value of the property. This is only used if
	*     `useNewValue` is true.
	* @category updates
	*/
	requestUpdate(name, oldValue, options, useNewValue = false, newValue) {
		if (name !== void 0) {
			if (name instanceof Event) issueWarning$4(``, `The requestUpdate() method was called with an Event as the property name. This is probably a mistake caused by binding this.requestUpdate as an event listener. Instead bind a function that will call it with no arguments: () => this.requestUpdate()`);
			const ctor = this.constructor;
			if (useNewValue === false) newValue = this[name];
			options ??= ctor.getPropertyOptions(name);
			if ((options.hasChanged ?? notEqual)(newValue, oldValue) || options.useDefault && options.reflect && newValue === this.__defaultValues?.get(name) && !this.hasAttribute(ctor.__attributeNameForProperty(name, options))) this._$changeProperty(name, oldValue, options);
			else return;
		}
		if (this.isUpdatePending === false) this.__updatePromise = this.__enqueueUpdate();
	}
	/**
	* @internal
	*/
	_$changeProperty(name, oldValue, { useDefault, reflect, wrapped }, initializeValue) {
		if (useDefault && !(this.__defaultValues ??= /* @__PURE__ */ new Map()).has(name)) {
			this.__defaultValues.set(name, initializeValue ?? oldValue ?? this[name]);
			if (wrapped !== true || initializeValue !== void 0) return;
		}
		if (!this._$changedProperties.has(name)) {
			if (!this.hasUpdated && !useDefault) oldValue = void 0;
			this._$changedProperties.set(name, oldValue);
		}
		if (reflect === true && this.__reflectingProperty !== name) (this.__reflectingProperties ??= /* @__PURE__ */ new Set()).add(name);
	}
	/**
	* Sets up the element to asynchronously update.
	*/
	async __enqueueUpdate() {
		this.isUpdatePending = true;
		try {
			await this.__updatePromise;
		} catch (e) {
			Promise.reject(e);
		}
		const result = this.scheduleUpdate();
		if (result != null) await result;
		return !this.isUpdatePending;
	}
	/**
	* Schedules an element update. You can override this method to change the
	* timing of updates by returning a Promise. The update will await the
	* returned Promise, and you should resolve the Promise to allow the update
	* to proceed. If this method is overridden, `super.scheduleUpdate()`
	* must be called.
	*
	* For instance, to schedule updates to occur just before the next frame:
	*
	* ```ts
	* override protected async scheduleUpdate(): Promise<unknown> {
	*   await new Promise((resolve) => requestAnimationFrame(() => resolve()));
	*   super.scheduleUpdate();
	* }
	* ```
	* @category updates
	*/
	scheduleUpdate() {
		const result = this.performUpdate();
		if (this.constructor.enabledWarnings.includes("async-perform-update") && typeof result?.then === "function") issueWarning$4("async-perform-update", `Element ${this.localName} returned a Promise from performUpdate(). This behavior is deprecated and will be removed in a future version of ReactiveElement.`);
		return result;
	}
	/**
	* Performs an element update. Note, if an exception is thrown during the
	* update, `firstUpdated` and `updated` will not be called.
	*
	* Call `performUpdate()` to immediately process a pending update. This should
	* generally not be needed, but it can be done in rare cases when you need to
	* update synchronously.
	*
	* @category updates
	*/
	performUpdate() {
		if (!this.isUpdatePending) return;
		debugLogEvent$1?.({ kind: "update" });
		if (!this.hasUpdated) {
			this.renderRoot ??= this.createRenderRoot();
			{
				const shadowedProperties = [...this.constructor.elementProperties.keys()].filter((p) => this.hasOwnProperty(p) && p in getPrototypeOf(this));
				if (shadowedProperties.length) throw new Error(`The following properties on element ${this.localName} will not trigger updates as expected because they are set using class fields: ${shadowedProperties.join(", ")}. Native class fields and some compiled output will overwrite accessors used for detecting changes. See https://lit.dev/msg/class-field-shadowing for more information.`);
			}
			if (this.__instanceProperties) {
				for (const [p, value] of this.__instanceProperties) this[p] = value;
				this.__instanceProperties = void 0;
			}
			const elementProperties = this.constructor.elementProperties;
			if (elementProperties.size > 0) for (const [p, options] of elementProperties) {
				const { wrapped } = options;
				const value = this[p];
				if (wrapped === true && !this._$changedProperties.has(p) && value !== void 0) this._$changeProperty(p, void 0, options, value);
			}
		}
		let shouldUpdate = false;
		const changedProperties = this._$changedProperties;
		try {
			shouldUpdate = this.shouldUpdate(changedProperties);
			if (shouldUpdate) {
				this.willUpdate(changedProperties);
				this.__controllers?.forEach((c) => c.hostUpdate?.());
				this.update(changedProperties);
			} else this.__markUpdated();
		} catch (e) {
			shouldUpdate = false;
			this.__markUpdated();
			throw e;
		}
		if (shouldUpdate) this._$didUpdate(changedProperties);
	}
	/**
	* Invoked before `update()` to compute values needed during the update.
	*
	* Implement `willUpdate` to compute property values that depend on other
	* properties and are used in the rest of the update process.
	*
	* ```ts
	* willUpdate(changedProperties) {
	*   // only need to check changed properties for an expensive computation.
	*   if (changedProperties.has('firstName') || changedProperties.has('lastName')) {
	*     this.sha = computeSHA(`${this.firstName} ${this.lastName}`);
	*   }
	* }
	*
	* render() {
	*   return html`SHA: ${this.sha}`;
	* }
	* ```
	*
	* @category updates
	*/
	willUpdate(_changedProperties) {}
	_$didUpdate(changedProperties) {
		this.__controllers?.forEach((c) => c.hostUpdated?.());
		if (!this.hasUpdated) {
			this.hasUpdated = true;
			this.firstUpdated(changedProperties);
		}
		this.updated(changedProperties);
		if (this.isUpdatePending && this.constructor.enabledWarnings.includes("change-in-update")) issueWarning$4("change-in-update", `Element ${this.localName} scheduled an update (generally because a property was set) after an update completed, causing a new update to be scheduled. This is inefficient and should be avoided unless the next update can only be scheduled as a side effect of the previous update.`);
	}
	__markUpdated() {
		this._$changedProperties = /* @__PURE__ */ new Map();
		this.isUpdatePending = false;
	}
	/**
	* Returns a Promise that resolves when the element has completed updating.
	* The Promise value is a boolean that is `true` if the element completed the
	* update without triggering another update. The Promise result is `false` if
	* a property was set inside `updated()`. If the Promise is rejected, an
	* exception was thrown during the update.
	*
	* To await additional asynchronous work, override the `getUpdateComplete`
	* method. For example, it is sometimes useful to await a rendered element
	* before fulfilling this Promise. To do this, first await
	* `super.getUpdateComplete()`, then any subsequent state.
	*
	* @return A promise of a boolean that resolves to true if the update completed
	*     without triggering another update.
	* @category updates
	*/
	get updateComplete() {
		return this.getUpdateComplete();
	}
	/**
	* Override point for the `updateComplete` promise.
	*
	* It is not safe to override the `updateComplete` getter directly due to a
	* limitation in TypeScript which means it is not possible to call a
	* superclass getter (e.g. `super.updateComplete.then(...)`) when the target
	* language is ES5 (https://github.com/microsoft/TypeScript/issues/338).
	* This method should be overridden instead. For example:
	*
	* ```ts
	* class MyElement extends LitElement {
	*   override async getUpdateComplete() {
	*     const result = await super.getUpdateComplete();
	*     await this._myChild.updateComplete;
	*     return result;
	*   }
	* }
	* ```
	*
	* @return A promise of a boolean that resolves to true if the update completed
	*     without triggering another update.
	* @category updates
	*/
	getUpdateComplete() {
		return this.__updatePromise;
	}
	/**
	* Controls whether or not `update()` should be called when the element requests
	* an update. By default, this method always returns `true`, but this can be
	* customized to control when to update.
	*
	* @param _changedProperties Map of changed properties with old values
	* @category updates
	*/
	shouldUpdate(_changedProperties) {
		return true;
	}
	/**
	* Updates the element. This method reflects property values to attributes.
	* It can be overridden to render and keep updated element DOM.
	* Setting properties inside this method will *not* trigger
	* another update.
	*
	* @param _changedProperties Map of changed properties with old values
	* @category updates
	*/
	update(_changedProperties) {
		this.__reflectingProperties &&= this.__reflectingProperties.forEach((p) => this.__propertyToAttribute(p, this[p]));
		this.__markUpdated();
	}
	/**
	* Invoked whenever the element is updated. Implement to perform
	* post-updating tasks via DOM APIs, for example, focusing an element.
	*
	* Setting properties inside this method will trigger the element to update
	* again after this update cycle completes.
	*
	* @param _changedProperties Map of changed properties with old values
	* @category updates
	*/
	updated(_changedProperties) {}
	/**
	* Invoked when the element is first updated. Implement to perform one time
	* work on the element after update.
	*
	* ```ts
	* firstUpdated() {
	*   this.renderRoot.getElementById('my-text-area').focus();
	* }
	* ```
	*
	* Setting properties inside this method will trigger the element to update
	* again after this update cycle completes.
	*
	* @param _changedProperties Map of changed properties with old values
	* @category updates
	*/
	firstUpdated(_changedProperties) {}
};
/**
* Memoized list of all element styles.
* Created lazily on user subclasses when finalizing the class.
* @nocollapse
* @category styles
*/
ReactiveElement.elementStyles = [];
/**
* Options used when calling `attachShadow`. Set this property to customize
* the options for the shadowRoot; for example, to create a closed
* shadowRoot: `{mode: 'closed'}`.
*
* Note, these options are used in `createRenderRoot`. If this method
* is customized, options should be respected if possible.
* @nocollapse
* @category rendering
*/
ReactiveElement.shadowRootOptions = { mode: "open" };
ReactiveElement[JSCompiler_renameProperty$1("elementProperties", ReactiveElement)] = /* @__PURE__ */ new Map();
ReactiveElement[JSCompiler_renameProperty$1("finalized", ReactiveElement)] = /* @__PURE__ */ new Map();
polyfillSupport$2?.({ ReactiveElement });
{
	ReactiveElement.enabledWarnings = ["change-in-update", "async-perform-update"];
	const ensureOwnWarnings = function(ctor) {
		if (!ctor.hasOwnProperty(JSCompiler_renameProperty$1("enabledWarnings", ctor))) ctor.enabledWarnings = ctor.enabledWarnings.slice();
	};
	ReactiveElement.enableWarning = function(warning) {
		ensureOwnWarnings(this);
		if (!this.enabledWarnings.includes(warning)) this.enabledWarnings.push(warning);
	};
	ReactiveElement.disableWarning = function(warning) {
		ensureOwnWarnings(this);
		const i = this.enabledWarnings.indexOf(warning);
		if (i >= 0) this.enabledWarnings.splice(i, 1);
	};
}
(global$2.reactiveElementVersions ??= []).push("2.1.2");
if (global$2.reactiveElementVersions.length > 1) queueMicrotask(() => {
	issueWarning$4("multiple-versions", "Multiple versions of Lit loaded. Loading multiple versions is not recommended.");
});
//#endregion
//#region node_modules/lit-html/development/lit-html.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var global$1 = globalThis;
/**
* Useful for visualizing and logging insights into what the Lit template system is doing.
*
* Compiled out of prod mode builds.
*/
var debugLogEvent = (event) => {
	if (!global$1.emitLitDebugLogEvents) return;
	global$1.dispatchEvent(new CustomEvent("lit-debug", { detail: event }));
};
var debugLogRenderId = 0;
var issueWarning$3;
global$1.litIssuedWarnings ??= /* @__PURE__ */ new Set();
/**
* Issue a warning if we haven't already, based either on `code` or `warning`.
* Warnings are disabled automatically only by `warning`; disabling via `code`
* can be done by users.
*/
issueWarning$3 = (code, warning) => {
	warning += code ? ` See https://lit.dev/msg/${code} for more information.` : "";
	if (!global$1.litIssuedWarnings.has(warning) && !global$1.litIssuedWarnings.has(code)) {
		console.warn(warning);
		global$1.litIssuedWarnings.add(warning);
	}
};
queueMicrotask(() => {
	issueWarning$3("dev-mode", `Lit is in dev mode. Not recommended for production!`);
});
var wrap$1 = global$1.ShadyDOM?.inUse && global$1.ShadyDOM?.noPatch === true ? global$1.ShadyDOM.wrap : (node) => node;
var trustedTypes = global$1.trustedTypes;
/**
* Our TrustedTypePolicy for HTML which is declared using the html template
* tag function.
*
* That HTML is a developer-authored constant, and is parsed with innerHTML
* before any untrusted expressions have been mixed in. Therefor it is
* considered safe by construction.
*/
var policy = trustedTypes ? trustedTypes.createPolicy("lit-html", { createHTML: (s) => s }) : void 0;
var identityFunction = (value) => value;
var noopSanitizer = (_node, _name, _type) => identityFunction;
/** Sets the global sanitizer factory. */
var setSanitizer = (newSanitizer) => {
	if (sanitizerFactoryInternal !== noopSanitizer) throw new Error("Attempted to overwrite existing lit-html security policy. setSanitizeDOMValueFactory should be called at most once.");
	sanitizerFactoryInternal = newSanitizer;
};
/**
* Only used in internal tests, not a part of the public API.
*/
var _testOnlyClearSanitizerFactoryDoNotCallOrElse = () => {
	sanitizerFactoryInternal = noopSanitizer;
};
var createSanitizer = (node, name, type) => {
	return sanitizerFactoryInternal(node, name, type);
};
var boundAttributeSuffix = "$lit$";
var marker = `lit$${Math.random().toFixed(9).slice(2)}$`;
var markerMatch = "?" + marker;
var nodeMarker = `<${markerMatch}>`;
var d$1 = document;
var createMarker$1 = () => d$1.createComment("");
var isPrimitive = (value) => value === null || typeof value != "object" && typeof value != "function";
var isArray = Array.isArray;
var isIterable = (value) => isArray(value) || typeof value?.[Symbol.iterator] === "function";
var SPACE_CHAR = `[ \t\n\f\r]`;
var ATTR_VALUE_CHAR = `[^ \t\n\f\r"'\`<>=]`;
var NAME_CHAR = `[^\\s"'>=/]`;
/**
* End of text is: `<` followed by:
*   (comment start) or (tag) or (dynamic tag binding)
*/
var textEndRegex = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var COMMENT_START = 1;
var TAG_NAME = 2;
var DYNAMIC_TAG_NAME = 3;
var commentEndRegex = /-->/g;
/**
* Comments not started with <!--, like </{, can be ended by a single `>`
*/
var comment2EndRegex = />/g;
/**
* The tagEnd regex matches the end of the "inside an opening" tag syntax
* position. It either matches a `>`, an attribute-like sequence, or the end
* of the string after a space (attribute-name position ending).
*
* See attributes in the HTML spec:
* https://www.w3.org/TR/html5/syntax.html#elements-attributes
*
* " \t\n\f\r" are HTML space characters:
* https://infra.spec.whatwg.org/#ascii-whitespace
*
* So an attribute is:
*  * The name: any character except a whitespace character, ("), ('), ">",
*    "=", or "/". Note: this is different from the HTML spec which also excludes control characters.
*  * Followed by zero or more space characters
*  * Followed by "="
*  * Followed by zero or more space characters
*  * Followed by:
*    * Any character except space, ('), ("), "<", ">", "=", (`), or
*    * (") then any non-("), or
*    * (') then any non-(')
*/
var tagEndRegex = new RegExp(`>|${SPACE_CHAR}(?:(${NAME_CHAR}+)(${SPACE_CHAR}*=${SPACE_CHAR}*(?:${ATTR_VALUE_CHAR}|("|')|))|$)`, "g");
var ENTIRE_MATCH = 0;
var ATTRIBUTE_NAME = 1;
var SPACES_AND_EQUALS = 2;
var QUOTE_CHAR = 3;
var singleQuoteAttrEndRegex = /'/g;
var doubleQuoteAttrEndRegex = /"/g;
/**
* Matches the raw text elements.
*
* Comments are not parsed within raw text elements, so we need to search their
* text content for marker strings.
*/
var rawTextElement = /^(?:script|style|textarea|title)$/i;
/** TemplateResult types */
var HTML_RESULT = 1;
var SVG_RESULT = 2;
var MATHML_RESULT = 3;
var ATTRIBUTE_PART = 1;
var CHILD_PART = 2;
var PROPERTY_PART = 3;
var BOOLEAN_ATTRIBUTE_PART = 4;
var EVENT_PART = 5;
var ELEMENT_PART = 6;
var COMMENT_PART = 7;
/**
* Generates a template literal tag function that returns a TemplateResult with
* the given result type.
*/
var tag = (type) => (strings, ...values) => {
	if (strings.some((s) => s === void 0)) console.warn("Some template strings are undefined.\nThis is probably caused by illegal octal escape sequences.");
	if (values.some((val) => val?.["_$litStatic$"])) issueWarning$3("", "Static values 'literal' or 'unsafeStatic' cannot be used as values to non-static templates.\nPlease use the static 'html' tag function. See https://lit.dev/docs/templates/expressions/#static-expressions");
	return {
		["_$litType$"]: type,
		strings,
		values
	};
};
/**
* Interprets a template literal as an HTML template that can efficiently
* render to and update a container.
*
* ```ts
* const header = (title: string) => html`<h1>${title}</h1>`;
* ```
*
* The `html` tag returns a description of the DOM to render as a value. It is
* lazy, meaning no work is done until the template is rendered. When rendering,
* if a template comes from the same expression as a previously rendered result,
* it's efficiently updated instead of replaced.
*/
var html = tag(HTML_RESULT);
/**
* Interprets a template literal as an SVG fragment that can efficiently render
* to and update a container.
*
* ```ts
* const rect = svg`<rect width="10" height="10"></rect>`;
*
* const myImage = html`
*   <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
*     ${rect}
*   </svg>`;
* ```
*
* The `svg` *tag function* should only be used for SVG fragments, or elements
* that would be contained **inside** an `<svg>` HTML element. A common error is
* placing an `<svg>` *element* in a template tagged with the `svg` tag
* function. The `<svg>` element is an HTML element and should be used within a
* template tagged with the {@linkcode html} tag function.
*
* In LitElement usage, it's invalid to return an SVG fragment from the
* `render()` method, as the SVG fragment will be contained within the element's
* shadow root and thus not be properly contained within an `<svg>` HTML
* element.
*/
var svg = tag(SVG_RESULT);
/**
* A sentinel value that signals that a value was handled by a directive and
* should not be written to the DOM.
*/
var noChange = Symbol.for("lit-noChange");
/**
* A sentinel value that signals a ChildPart to fully clear its content.
*
* ```ts
* const button = html`${
*  user.isAdmin
*    ? html`<button>DELETE</button>`
*    : nothing
* }`;
* ```
*
* Prefer using `nothing` over other falsy values as it provides a consistent
* behavior between various expression binding contexts.
*
* In child expressions, `undefined`, `null`, `''`, and `nothing` all behave the
* same and render no nodes. In attribute expressions, `nothing` _removes_ the
* attribute, while `undefined` and `null` will render an empty string. In
* property expressions `nothing` becomes `undefined`.
*/
var nothing = Symbol.for("lit-nothing");
/**
* The cache of prepared templates, keyed by the tagged TemplateStringsArray
* and _not_ accounting for the specific template tag used. This means that
* template tags cannot be dynamic - they must statically be one of html, svg,
* or attr. This restriction simplifies the cache lookup, which is on the hot
* path for rendering.
*/
var templateCache = /* @__PURE__ */ new WeakMap();
var walker = d$1.createTreeWalker(d$1, 129);
var sanitizerFactoryInternal = noopSanitizer;
function trustFromTemplateString(tsa, stringFromTSA) {
	if (!isArray(tsa) || !tsa.hasOwnProperty("raw")) {
		let message = "invalid template strings array";
		message = `
          Internal Error: expected template strings to be an array
          with a 'raw' field. Faking a template strings array by
          calling html or svg like an ordinary function is effectively
          the same as calling unsafeHtml and can lead to major security
          issues, e.g. opening your code up to XSS attacks.
          If you're using the html or svg tagged template functions normally
          and still seeing this error, please file a bug at
          https://github.com/lit/lit/issues/new?template=bug_report.md
          and include information about your build tooling, if any.
        `.trim().replace(/\n */g, "\n");
		throw new Error(message);
	}
	return policy !== void 0 ? policy.createHTML(stringFromTSA) : stringFromTSA;
}
/**
* Returns an HTML string for the given TemplateStringsArray and result type
* (HTML or SVG), along with the case-sensitive bound attribute names in
* template order. The HTML contains comment markers denoting the `ChildPart`s
* and suffixes on bound attributes denoting the `AttributeParts`.
*
* @param strings template strings array
* @param type HTML or SVG
* @return Array containing `[html, attrNames]` (array returned for terseness,
*     to avoid object fields since this code is shared with non-minified SSR
*     code)
*/
var getTemplateHtml = (strings, type) => {
	const l = strings.length - 1;
	const attrNames = [];
	let html = type === SVG_RESULT ? "<svg>" : type === MATHML_RESULT ? "<math>" : "";
	let rawTextEndRegex;
	let regex = textEndRegex;
	for (let i = 0; i < l; i++) {
		const s = strings[i];
		let attrNameEndIndex = -1;
		let attrName;
		let lastIndex = 0;
		let match;
		while (lastIndex < s.length) {
			regex.lastIndex = lastIndex;
			match = regex.exec(s);
			if (match === null) break;
			lastIndex = regex.lastIndex;
			if (regex === textEndRegex) {
				if (match[COMMENT_START] === "!--") regex = commentEndRegex;
				else if (match[COMMENT_START] !== void 0) regex = comment2EndRegex;
				else if (match[TAG_NAME] !== void 0) {
					if (rawTextElement.test(match[TAG_NAME])) rawTextEndRegex = new RegExp(`</${match[TAG_NAME]}`, "g");
					regex = tagEndRegex;
				} else if (match[DYNAMIC_TAG_NAME] !== void 0) throw new Error("Bindings in tag names are not supported. Please use static templates instead. See https://lit.dev/docs/templates/expressions/#static-expressions");
			} else if (regex === tagEndRegex) if (match[ENTIRE_MATCH] === ">") {
				regex = rawTextEndRegex ?? textEndRegex;
				attrNameEndIndex = -1;
			} else if (match[ATTRIBUTE_NAME] === void 0) attrNameEndIndex = -2;
			else {
				attrNameEndIndex = regex.lastIndex - match[SPACES_AND_EQUALS].length;
				attrName = match[ATTRIBUTE_NAME];
				regex = match[QUOTE_CHAR] === void 0 ? tagEndRegex : match[QUOTE_CHAR] === "\"" ? doubleQuoteAttrEndRegex : singleQuoteAttrEndRegex;
			}
			else if (regex === doubleQuoteAttrEndRegex || regex === singleQuoteAttrEndRegex) regex = tagEndRegex;
			else if (regex === commentEndRegex || regex === comment2EndRegex) regex = textEndRegex;
			else {
				regex = tagEndRegex;
				rawTextEndRegex = void 0;
			}
		}
		console.assert(attrNameEndIndex === -1 || regex === tagEndRegex || regex === singleQuoteAttrEndRegex || regex === doubleQuoteAttrEndRegex, "unexpected parse state B");
		const end = regex === tagEndRegex && strings[i + 1].startsWith("/>") ? " " : "";
		html += regex === textEndRegex ? s + nodeMarker : attrNameEndIndex >= 0 ? (attrNames.push(attrName), s.slice(0, attrNameEndIndex) + boundAttributeSuffix + s.slice(attrNameEndIndex)) + marker + end : s + marker + (attrNameEndIndex === -2 ? i : end);
	}
	return [trustFromTemplateString(strings, html + (strings[l] || "<?>") + (type === SVG_RESULT ? "</svg>" : type === MATHML_RESULT ? "</math>" : "")), attrNames];
};
var Template = class Template {
	constructor({ strings, ["_$litType$"]: type }, options) {
		this.parts = [];
		let node;
		let nodeIndex = 0;
		let attrNameIndex = 0;
		const partCount = strings.length - 1;
		const parts = this.parts;
		const [html, attrNames] = getTemplateHtml(strings, type);
		this.el = Template.createElement(html, options);
		walker.currentNode = this.el.content;
		if (type === SVG_RESULT || type === MATHML_RESULT) {
			const wrapper = this.el.content.firstChild;
			wrapper.replaceWith(...wrapper.childNodes);
		}
		while ((node = walker.nextNode()) !== null && parts.length < partCount) {
			if (node.nodeType === 1) {
				{
					const tag = node.localName;
					if (/^(?:textarea|template)$/i.test(tag) && node.innerHTML.includes(marker)) {
						const m = `Expressions are not supported inside \`${tag}\` elements. See https://lit.dev/msg/expression-in-${tag} for more information.`;
						if (tag === "template") throw new Error(m);
						else issueWarning$3("", m);
					}
				}
				if (node.hasAttributes()) {
					for (const name of node.getAttributeNames()) if (name.endsWith(boundAttributeSuffix)) {
						const realName = attrNames[attrNameIndex++];
						const statics = node.getAttribute(name).split(marker);
						const m = /([.?@])?(.*)/.exec(realName);
						parts.push({
							type: ATTRIBUTE_PART,
							index: nodeIndex,
							name: m[2],
							strings: statics,
							ctor: m[1] === "." ? PropertyPart : m[1] === "?" ? BooleanAttributePart : m[1] === "@" ? EventPart : AttributePart
						});
						node.removeAttribute(name);
					} else if (name.startsWith(marker)) {
						parts.push({
							type: ELEMENT_PART,
							index: nodeIndex
						});
						node.removeAttribute(name);
					}
				}
				if (rawTextElement.test(node.tagName)) {
					const strings = node.textContent.split(marker);
					const lastIndex = strings.length - 1;
					if (lastIndex > 0) {
						node.textContent = trustedTypes ? trustedTypes.emptyScript : "";
						for (let i = 0; i < lastIndex; i++) {
							node.append(strings[i], createMarker$1());
							walker.nextNode();
							parts.push({
								type: CHILD_PART,
								index: ++nodeIndex
							});
						}
						node.append(strings[lastIndex], createMarker$1());
					}
				}
			} else if (node.nodeType === 8) if (node.data === markerMatch) parts.push({
				type: CHILD_PART,
				index: nodeIndex
			});
			else {
				let i = -1;
				while ((i = node.data.indexOf(marker, i + 1)) !== -1) {
					parts.push({
						type: COMMENT_PART,
						index: nodeIndex
					});
					i += marker.length - 1;
				}
			}
			nodeIndex++;
		}
		if (attrNames.length !== attrNameIndex) throw new Error("Detected duplicate attribute bindings. This occurs if your template has duplicate attributes on an element tag. For example \"<input ?disabled=${true} ?disabled=${false}>\" contains a duplicate \"disabled\" attribute. The error was detected in the following template: \n`" + strings.join("${...}") + "`");
		debugLogEvent && debugLogEvent({
			kind: "template prep",
			template: this,
			clonableTemplate: this.el,
			parts: this.parts,
			strings
		});
	}
	/** @nocollapse */
	static createElement(html, _options) {
		const el = d$1.createElement("template");
		el.innerHTML = html;
		return el;
	}
};
function resolveDirective(part, value, parent = part, attributeIndex) {
	if (value === noChange) return value;
	let currentDirective = attributeIndex !== void 0 ? parent.__directives?.[attributeIndex] : parent.__directive;
	const nextDirectiveConstructor = isPrimitive(value) ? void 0 : value["_$litDirective$"];
	if (currentDirective?.constructor !== nextDirectiveConstructor) {
		currentDirective?.["_$notifyDirectiveConnectionChanged"]?.(false);
		if (nextDirectiveConstructor === void 0) currentDirective = void 0;
		else {
			currentDirective = new nextDirectiveConstructor(part);
			currentDirective._$initialize(part, parent, attributeIndex);
		}
		if (attributeIndex !== void 0) (parent.__directives ??= [])[attributeIndex] = currentDirective;
		else parent.__directive = currentDirective;
	}
	if (currentDirective !== void 0) value = resolveDirective(part, currentDirective._$resolve(part, value.values), currentDirective, attributeIndex);
	return value;
}
/**
* An updateable instance of a Template. Holds references to the Parts used to
* update the template instance.
*/
var TemplateInstance = class {
	constructor(template, parent) {
		this._$parts = [];
		/** @internal */
		this._$disconnectableChildren = void 0;
		this._$template = template;
		this._$parent = parent;
	}
	get parentNode() {
		return this._$parent.parentNode;
	}
	get _$isConnected() {
		return this._$parent._$isConnected;
	}
	_clone(options) {
		const { el: { content }, parts } = this._$template;
		const fragment = (options?.creationScope ?? d$1).importNode(content, true);
		walker.currentNode = fragment;
		let node = walker.nextNode();
		let nodeIndex = 0;
		let partIndex = 0;
		let templatePart = parts[0];
		while (templatePart !== void 0) {
			if (nodeIndex === templatePart.index) {
				let part;
				if (templatePart.type === CHILD_PART) part = new ChildPart$1(node, node.nextSibling, this, options);
				else if (templatePart.type === ATTRIBUTE_PART) part = new templatePart.ctor(node, templatePart.name, templatePart.strings, this, options);
				else if (templatePart.type === ELEMENT_PART) part = new ElementPart(node, this, options);
				this._$parts.push(part);
				templatePart = parts[++partIndex];
			}
			if (nodeIndex !== templatePart?.index) {
				node = walker.nextNode();
				nodeIndex++;
			}
		}
		walker.currentNode = d$1;
		return fragment;
	}
	_update(values) {
		let i = 0;
		for (const part of this._$parts) {
			if (part !== void 0) {
				debugLogEvent && debugLogEvent({
					kind: "set part",
					part,
					value: values[i],
					valueIndex: i,
					values,
					templateInstance: this
				});
				if (part.strings !== void 0) {
					part._$setValue(values, part, i);
					i += part.strings.length - 2;
				} else part._$setValue(values[i]);
			}
			i++;
		}
	}
};
var ChildPart$1 = class ChildPart$1 {
	get _$isConnected() {
		return this._$parent?._$isConnected ?? this.__isConnected;
	}
	constructor(startNode, endNode, parent, options) {
		this.type = CHILD_PART;
		this._$committedValue = nothing;
		/** @internal */
		this._$disconnectableChildren = void 0;
		this._$startNode = startNode;
		this._$endNode = endNode;
		this._$parent = parent;
		this.options = options;
		this.__isConnected = options?.isConnected ?? true;
		this._textSanitizer = void 0;
	}
	/**
	* The parent node into which the part renders its content.
	*
	* A ChildPart's content consists of a range of adjacent child nodes of
	* `.parentNode`, possibly bordered by 'marker nodes' (`.startNode` and
	* `.endNode`).
	*
	* - If both `.startNode` and `.endNode` are non-null, then the part's content
	* consists of all siblings between `.startNode` and `.endNode`, exclusively.
	*
	* - If `.startNode` is non-null but `.endNode` is null, then the part's
	* content consists of all siblings following `.startNode`, up to and
	* including the last child of `.parentNode`. If `.endNode` is non-null, then
	* `.startNode` will always be non-null.
	*
	* - If both `.endNode` and `.startNode` are null, then the part's content
	* consists of all child nodes of `.parentNode`.
	*/
	get parentNode() {
		let parentNode = wrap$1(this._$startNode).parentNode;
		const parent = this._$parent;
		if (parent !== void 0 && parentNode?.nodeType === 11) parentNode = parent.parentNode;
		return parentNode;
	}
	/**
	* The part's leading marker node, if any. See `.parentNode` for more
	* information.
	*/
	get startNode() {
		return this._$startNode;
	}
	/**
	* The part's trailing marker node, if any. See `.parentNode` for more
	* information.
	*/
	get endNode() {
		return this._$endNode;
	}
	_$setValue(value, directiveParent = this) {
		if (this.parentNode === null) throw new Error(`This \`ChildPart\` has no \`parentNode\` and therefore cannot accept a value. This likely means the element containing the part was manipulated in an unsupported way outside of Lit's control such that the part's marker nodes were ejected from DOM. For example, setting the element's \`innerHTML\` or \`textContent\` can do this.`);
		value = resolveDirective(this, value, directiveParent);
		if (isPrimitive(value)) {
			if (value === nothing || value == null || value === "") {
				if (this._$committedValue !== nothing) {
					debugLogEvent && debugLogEvent({
						kind: "commit nothing to child",
						start: this._$startNode,
						end: this._$endNode,
						parent: this._$parent,
						options: this.options
					});
					this._$clear();
				}
				this._$committedValue = nothing;
			} else if (value !== this._$committedValue && value !== noChange) this._commitText(value);
		} else if (value["_$litType$"] !== void 0) this._commitTemplateResult(value);
		else if (value.nodeType !== void 0) {
			if (this.options?.host === value) {
				this._commitText("[probable mistake: rendered a template's host in itself (commonly caused by writing ${this} in a template]");
				console.warn(`Attempted to render the template host`, value, `inside itself. This is almost always a mistake, and in dev mode `, `we render some warning text. In production however, we'll `, `render it, which will usually result in an error, and sometimes `, `in the element disappearing from the DOM.`);
				return;
			}
			this._commitNode(value);
		} else if (isIterable(value)) this._commitIterable(value);
		else this._commitText(value);
	}
	_insert(node) {
		return wrap$1(wrap$1(this._$startNode).parentNode).insertBefore(node, this._$endNode);
	}
	_commitNode(value) {
		if (this._$committedValue !== value) {
			this._$clear();
			if (sanitizerFactoryInternal !== noopSanitizer) {
				const parentNodeName = this._$startNode.parentNode?.nodeName;
				if (parentNodeName === "STYLE" || parentNodeName === "SCRIPT") {
					let message = "Forbidden";
					if (parentNodeName === "STYLE") message = "Lit does not support binding inside style nodes. This is a security risk, as style injection attacks can exfiltrate data and spoof UIs. Consider instead using css`...` literals to compose styles, and do dynamic styling with css custom properties, ::parts, <slot>s, and by mutating the DOM rather than stylesheets.";
					else message = "Lit does not support binding inside script nodes. This is a security risk, as it could allow arbitrary code execution.";
					throw new Error(message);
				}
			}
			debugLogEvent && debugLogEvent({
				kind: "commit node",
				start: this._$startNode,
				parent: this._$parent,
				value,
				options: this.options
			});
			this._$committedValue = this._insert(value);
		}
	}
	_commitText(value) {
		if (this._$committedValue !== nothing && isPrimitive(this._$committedValue)) {
			const node = wrap$1(this._$startNode).nextSibling;
			if (this._textSanitizer === void 0) this._textSanitizer = createSanitizer(node, "data", "property");
			value = this._textSanitizer(value);
			debugLogEvent && debugLogEvent({
				kind: "commit text",
				node,
				value,
				options: this.options
			});
			node.data = value;
		} else {
			const textNode = d$1.createTextNode("");
			this._commitNode(textNode);
			if (this._textSanitizer === void 0) this._textSanitizer = createSanitizer(textNode, "data", "property");
			value = this._textSanitizer(value);
			debugLogEvent && debugLogEvent({
				kind: "commit text",
				node: textNode,
				value,
				options: this.options
			});
			textNode.data = value;
		}
		this._$committedValue = value;
	}
	_commitTemplateResult(result) {
		const { values, ["_$litType$"]: type } = result;
		const template = typeof type === "number" ? this._$getTemplate(result) : (type.el === void 0 && (type.el = Template.createElement(trustFromTemplateString(type.h, type.h[0]), this.options)), type);
		if (this._$committedValue?._$template === template) {
			debugLogEvent && debugLogEvent({
				kind: "template updating",
				template,
				instance: this._$committedValue,
				parts: this._$committedValue._$parts,
				options: this.options,
				values
			});
			this._$committedValue._update(values);
		} else {
			const instance = new TemplateInstance(template, this);
			const fragment = instance._clone(this.options);
			debugLogEvent && debugLogEvent({
				kind: "template instantiated",
				template,
				instance,
				parts: instance._$parts,
				options: this.options,
				fragment,
				values
			});
			instance._update(values);
			debugLogEvent && debugLogEvent({
				kind: "template instantiated and updated",
				template,
				instance,
				parts: instance._$parts,
				options: this.options,
				fragment,
				values
			});
			this._commitNode(fragment);
			this._$committedValue = instance;
		}
	}
	/** @internal */
	_$getTemplate(result) {
		let template = templateCache.get(result.strings);
		if (template === void 0) templateCache.set(result.strings, template = new Template(result));
		return template;
	}
	_commitIterable(value) {
		if (!isArray(this._$committedValue)) {
			this._$committedValue = [];
			this._$clear();
		}
		const itemParts = this._$committedValue;
		let partIndex = 0;
		let itemPart;
		for (const item of value) {
			if (partIndex === itemParts.length) itemParts.push(itemPart = new ChildPart$1(this._insert(createMarker$1()), this._insert(createMarker$1()), this, this.options));
			else itemPart = itemParts[partIndex];
			itemPart._$setValue(item);
			partIndex++;
		}
		if (partIndex < itemParts.length) {
			this._$clear(itemPart && wrap$1(itemPart._$endNode).nextSibling, partIndex);
			itemParts.length = partIndex;
		}
	}
	/**
	* Removes the nodes contained within this Part from the DOM.
	*
	* @param start Start node to clear from, for clearing a subset of the part's
	*     DOM (used when truncating iterables)
	* @param from  When `start` is specified, the index within the iterable from
	*     which ChildParts are being removed, used for disconnecting directives
	*     in those Parts.
	*
	* @internal
	*/
	_$clear(start = wrap$1(this._$startNode).nextSibling, from) {
		this._$notifyConnectionChanged?.(false, true, from);
		while (start !== this._$endNode) {
			const n = wrap$1(start).nextSibling;
			wrap$1(start).remove();
			start = n;
		}
	}
	/**
	* Implementation of RootPart's `isConnected`. Note that this method
	* should only be called on `RootPart`s (the `ChildPart` returned from a
	* top-level `render()` call). It has no effect on non-root ChildParts.
	* @param isConnected Whether to set
	* @internal
	*/
	setConnected(isConnected) {
		if (this._$parent === void 0) {
			this.__isConnected = isConnected;
			this._$notifyConnectionChanged?.(isConnected);
		} else throw new Error("part.setConnected() may only be called on a RootPart returned from render().");
	}
};
var AttributePart = class {
	get tagName() {
		return this.element.tagName;
	}
	get _$isConnected() {
		return this._$parent._$isConnected;
	}
	constructor(element, name, strings, parent, options) {
		this.type = ATTRIBUTE_PART;
		/** @internal */
		this._$committedValue = nothing;
		/** @internal */
		this._$disconnectableChildren = void 0;
		this.element = element;
		this.name = name;
		this._$parent = parent;
		this.options = options;
		if (strings.length > 2 || strings[0] !== "" || strings[1] !== "") {
			this._$committedValue = new Array(strings.length - 1).fill(/* @__PURE__ */ new String());
			this.strings = strings;
		} else this._$committedValue = nothing;
		this._sanitizer = void 0;
	}
	/**
	* Sets the value of this part by resolving the value from possibly multiple
	* values and static strings and committing it to the DOM.
	* If this part is single-valued, `this._strings` will be undefined, and the
	* method will be called with a single value argument. If this part is
	* multi-value, `this._strings` will be defined, and the method is called
	* with the value array of the part's owning TemplateInstance, and an offset
	* into the value array from which the values should be read.
	* This method is overloaded this way to eliminate short-lived array slices
	* of the template instance values, and allow a fast-path for single-valued
	* parts.
	*
	* @param value The part value, or an array of values for multi-valued parts
	* @param valueIndex the index to start reading values from. `undefined` for
	*   single-valued parts
	* @param noCommit causes the part to not commit its value to the DOM. Used
	*   in hydration to prime attribute parts with their first-rendered value,
	*   but not set the attribute, and in SSR to no-op the DOM operation and
	*   capture the value for serialization.
	*
	* @internal
	*/
	_$setValue(value, directiveParent = this, valueIndex, noCommit) {
		const strings = this.strings;
		let change = false;
		if (strings === void 0) {
			value = resolveDirective(this, value, directiveParent, 0);
			change = !isPrimitive(value) || value !== this._$committedValue && value !== noChange;
			if (change) this._$committedValue = value;
		} else {
			const values = value;
			value = strings[0];
			let i, v;
			for (i = 0; i < strings.length - 1; i++) {
				v = resolveDirective(this, values[valueIndex + i], directiveParent, i);
				if (v === noChange) v = this._$committedValue[i];
				change ||= !isPrimitive(v) || v !== this._$committedValue[i];
				if (v === nothing) value = nothing;
				else if (value !== nothing) value += (v ?? "") + strings[i + 1];
				this._$committedValue[i] = v;
			}
		}
		if (change && !noCommit) this._commitValue(value);
	}
	/** @internal */
	_commitValue(value) {
		if (value === nothing) wrap$1(this.element).removeAttribute(this.name);
		else {
			if (this._sanitizer === void 0) this._sanitizer = sanitizerFactoryInternal(this.element, this.name, "attribute");
			value = this._sanitizer(value ?? "");
			debugLogEvent && debugLogEvent({
				kind: "commit attribute",
				element: this.element,
				name: this.name,
				value,
				options: this.options
			});
			wrap$1(this.element).setAttribute(this.name, value ?? "");
		}
	}
};
var PropertyPart = class extends AttributePart {
	constructor() {
		super(...arguments);
		this.type = PROPERTY_PART;
	}
	/** @internal */
	_commitValue(value) {
		if (this._sanitizer === void 0) this._sanitizer = sanitizerFactoryInternal(this.element, this.name, "property");
		value = this._sanitizer(value);
		debugLogEvent && debugLogEvent({
			kind: "commit property",
			element: this.element,
			name: this.name,
			value,
			options: this.options
		});
		this.element[this.name] = value === nothing ? void 0 : value;
	}
};
var BooleanAttributePart = class extends AttributePart {
	constructor() {
		super(...arguments);
		this.type = BOOLEAN_ATTRIBUTE_PART;
	}
	/** @internal */
	_commitValue(value) {
		debugLogEvent && debugLogEvent({
			kind: "commit boolean attribute",
			element: this.element,
			name: this.name,
			value: !!(value && value !== nothing),
			options: this.options
		});
		wrap$1(this.element).toggleAttribute(this.name, !!value && value !== nothing);
	}
};
var EventPart = class extends AttributePart {
	constructor(element, name, strings, parent, options) {
		super(element, name, strings, parent, options);
		this.type = EVENT_PART;
		if (this.strings !== void 0) throw new Error(`A \`<${element.localName}>\` has a \`@${name}=...\` listener with invalid content. Event listeners in templates must have exactly one expression and no surrounding text.`);
	}
	/** @internal */
	_$setValue(newListener, directiveParent = this) {
		newListener = resolveDirective(this, newListener, directiveParent, 0) ?? nothing;
		if (newListener === noChange) return;
		const oldListener = this._$committedValue;
		const shouldRemoveListener = newListener === nothing && oldListener !== nothing || newListener.capture !== oldListener.capture || newListener.once !== oldListener.once || newListener.passive !== oldListener.passive;
		const shouldAddListener = newListener !== nothing && (oldListener === nothing || shouldRemoveListener);
		debugLogEvent && debugLogEvent({
			kind: "commit event listener",
			element: this.element,
			name: this.name,
			value: newListener,
			options: this.options,
			removeListener: shouldRemoveListener,
			addListener: shouldAddListener,
			oldListener
		});
		if (shouldRemoveListener) this.element.removeEventListener(this.name, this, oldListener);
		if (shouldAddListener) this.element.addEventListener(this.name, this, newListener);
		this._$committedValue = newListener;
	}
	handleEvent(event) {
		if (typeof this._$committedValue === "function") this._$committedValue.call(this.options?.host ?? this.element, event);
		else this._$committedValue.handleEvent(event);
	}
};
var ElementPart = class {
	constructor(element, parent, options) {
		this.element = element;
		this.type = ELEMENT_PART;
		/** @internal */
		this._$disconnectableChildren = void 0;
		this._$parent = parent;
		this.options = options;
	}
	get _$isConnected() {
		return this._$parent._$isConnected;
	}
	_$setValue(value) {
		debugLogEvent && debugLogEvent({
			kind: "commit to element binding",
			element: this.element,
			value,
			options: this.options
		});
		resolveDirective(this, value);
	}
};
/**
* END USERS SHOULD NOT RELY ON THIS OBJECT.
*
* Private exports for use by other Lit packages, not intended for use by
* external users.
*
* We currently do not make a mangled rollup build of the lit-ssr code. In order
* to keep a number of (otherwise private) top-level exports mangled in the
* client side code, we export a _$LH object containing those members (or
* helper methods for accessing private fields of those members), and then
* re-export them for use in lit-ssr. This keeps lit-ssr agnostic to whether the
* client-side code is being used in `dev` mode or `prod` mode.
*
* This has a unique name, to disambiguate it from private exports in
* lit-element, which re-exports all of lit-html.
*
* @private
*/
var _$LH = {
	_boundAttributeSuffix: boundAttributeSuffix,
	_marker: marker,
	_markerMatch: markerMatch,
	_HTML_RESULT: HTML_RESULT,
	_getTemplateHtml: getTemplateHtml,
	_TemplateInstance: TemplateInstance,
	_isIterable: isIterable,
	_resolveDirective: resolveDirective,
	_ChildPart: ChildPart$1,
	_AttributePart: AttributePart,
	_BooleanAttributePart: BooleanAttributePart,
	_EventPart: EventPart,
	_PropertyPart: PropertyPart,
	_ElementPart: ElementPart
};
var polyfillSupport$1 = global$1.litHtmlPolyfillSupportDevMode;
polyfillSupport$1?.(Template, ChildPart$1);
(global$1.litHtmlVersions ??= []).push("3.3.3");
if (global$1.litHtmlVersions.length > 1) queueMicrotask(() => {
	issueWarning$3("multiple-versions", "Multiple versions of Lit loaded. Loading multiple versions is not recommended.");
});
/**
* Renders a value, usually a lit-html TemplateResult, to the container.
*
* This example renders the text "Hello, Zoe!" inside a paragraph tag, appending
* it to the container `document.body`.
*
* ```js
* import {html, render} from 'lit';
*
* const name = "Zoe";
* render(html`<p>Hello, ${name}!</p>`, document.body);
* ```
*
* @param value Any [renderable
*   value](https://lit.dev/docs/templates/expressions/#child-expressions),
*   typically a {@linkcode TemplateResult} created by evaluating a template tag
*   like {@linkcode html} or {@linkcode svg}.
* @param container A DOM container to render to. The first render will append
*   the rendered value to the container, and subsequent renders will
*   efficiently update the rendered value if the same result type was
*   previously rendered there.
* @param options See {@linkcode RenderOptions} for options documentation.
* @see
* {@link https://lit.dev/docs/libraries/standalone-templates/#rendering-lit-html-templates| Rendering Lit HTML Templates}
*/
var render = (value, container, options) => {
	if (container == null) throw new TypeError(`The container to render into may not be ${container}`);
	const renderId = debugLogRenderId++;
	const partOwnerNode = options?.renderBefore ?? container;
	let part = partOwnerNode["_$litPart$"];
	debugLogEvent && debugLogEvent({
		kind: "begin render",
		id: renderId,
		value,
		container,
		options,
		part
	});
	if (part === void 0) {
		const endNode = options?.renderBefore ?? null;
		partOwnerNode["_$litPart$"] = part = new ChildPart$1(container.insertBefore(createMarker$1(), endNode), endNode, void 0, options ?? {});
	}
	part._$setValue(value);
	debugLogEvent && debugLogEvent({
		kind: "end render",
		id: renderId,
		value,
		container,
		options,
		part
	});
	return part;
};
render.setSanitizer = setSanitizer;
render.createSanitizer = createSanitizer;
render._testOnlyClearSanitizerFactoryDoNotCallOrElse = _testOnlyClearSanitizerFactoryDoNotCallOrElse;
//#endregion
//#region node_modules/lit-element/development/lit-element.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
/**
* The main LitElement module, which defines the {@linkcode LitElement} base
* class and related APIs.
*
* LitElement components can define a template and a set of observed
* properties. Changing an observed property triggers a re-render of the
* element.
*
* Import {@linkcode LitElement} and {@linkcode html} from this module to
* create a component:
*
*  ```js
* import {LitElement, html} from 'lit-element';
*
* class MyElement extends LitElement {
*
*   // Declare observed properties
*   static get properties() {
*     return {
*       adjective: {}
*     }
*   }
*
*   constructor() {
*     this.adjective = 'awesome';
*   }
*
*   // Define the element's template
*   render() {
*     return html`<p>your ${adjective} template here</p>`;
*   }
* }
*
* customElements.define('my-element', MyElement);
* ```
*
* `LitElement` extends {@linkcode ReactiveElement} and adds lit-html
* templating. The `ReactiveElement` class is provided for users that want to
* build their own custom element base classes that don't use lit-html.
*
* @packageDocumentation
*/
var JSCompiler_renameProperty = (prop, _obj) => prop;
var global = globalThis;
var issueWarning$2;
global.litIssuedWarnings ??= /* @__PURE__ */ new Set();
/**
* Issue a warning if we haven't already, based either on `code` or `warning`.
* Warnings are disabled automatically only by `warning`; disabling via `code`
* can be done by users.
*/
issueWarning$2 = (code, warning) => {
	warning += ` See https://lit.dev/msg/${code} for more information.`;
	if (!global.litIssuedWarnings.has(warning) && !global.litIssuedWarnings.has(code)) {
		console.warn(warning);
		global.litIssuedWarnings.add(warning);
	}
};
/**
* Base element class that manages element properties and attributes, and
* renders a lit-html template.
*
* To define a component, subclass `LitElement` and implement a
* `render` method to provide the component's template. Define properties
* using the {@linkcode LitElement.properties properties} property or the
* {@linkcode property} decorator.
*/
var LitElement = class extends ReactiveElement {
	constructor() {
		super(...arguments);
		/**
		* @category rendering
		*/
		this.renderOptions = { host: this };
		this.__childPart = void 0;
	}
	/**
	* @category rendering
	*/
	createRenderRoot() {
		const renderRoot = super.createRenderRoot();
		this.renderOptions.renderBefore ??= renderRoot.firstChild;
		return renderRoot;
	}
	/**
	* Updates the element. This method reflects property values to attributes
	* and calls `render` to render DOM via lit-html. Setting properties inside
	* this method will *not* trigger another update.
	* @param changedProperties Map of changed properties with old values
	* @category updates
	*/
	update(changedProperties) {
		const value = this.render();
		if (!this.hasUpdated) this.renderOptions.isConnected = this.isConnected;
		super.update(changedProperties);
		this.__childPart = render(value, this.renderRoot, this.renderOptions);
	}
	/**
	* Invoked when the component is added to the document's DOM.
	*
	* In `connectedCallback()` you should setup tasks that should only occur when
	* the element is connected to the document. The most common of these is
	* adding event listeners to nodes external to the element, like a keydown
	* event handler added to the window.
	*
	* ```ts
	* connectedCallback() {
	*   super.connectedCallback();
	*   addEventListener('keydown', this._handleKeydown);
	* }
	* ```
	*
	* Typically, anything done in `connectedCallback()` should be undone when the
	* element is disconnected, in `disconnectedCallback()`.
	*
	* @category lifecycle
	*/
	connectedCallback() {
		super.connectedCallback();
		this.__childPart?.setConnected(true);
	}
	/**
	* Invoked when the component is removed from the document's DOM.
	*
	* This callback is the main signal to the element that it may no longer be
	* used. `disconnectedCallback()` should ensure that nothing is holding a
	* reference to the element (such as event listeners added to nodes external
	* to the element), so that it is free to be garbage collected.
	*
	* ```ts
	* disconnectedCallback() {
	*   super.disconnectedCallback();
	*   window.removeEventListener('keydown', this._handleKeydown);
	* }
	* ```
	*
	* An element may be re-connected after being disconnected.
	*
	* @category lifecycle
	*/
	disconnectedCallback() {
		super.disconnectedCallback();
		this.__childPart?.setConnected(false);
	}
	/**
	* Invoked on each update to perform rendering tasks. This method may return
	* any value renderable by lit-html's `ChildPart` - typically a
	* `TemplateResult`. Setting properties inside this method will *not* trigger
	* the element to update.
	* @category rendering
	*/
	render() {
		return noChange;
	}
};
LitElement["_$litElement$"] = true;
/**
* Ensure this class is marked as `finalized` as an optimization ensuring
* it will not needlessly try to `finalize`.
*
* Note this property name is a string to prevent breaking Closure JS Compiler
* optimizations. See @lit/reactive-element for more information.
*/
LitElement[JSCompiler_renameProperty("finalized", LitElement)] = true;
global.litElementHydrateSupport?.({ LitElement });
var polyfillSupport = global.litElementPolyfillSupportDevMode;
polyfillSupport?.({ LitElement });
(global.litElementVersions ??= []).push("4.2.2");
if (global.litElementVersions.length > 1) queueMicrotask(() => {
	issueWarning$2("multiple-versions", "Multiple versions of Lit loaded. Loading multiple versions is not recommended.");
});
//#endregion
//#region node_modules/@lit/reactive-element/development/decorators/custom-element.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
/**
* Class decorator factory that defines the decorated class as a custom element.
*
* ```js
* @customElement('my-element')
* class MyElement extends LitElement {
*   render() {
*     return html``;
*   }
* }
* ```
* @category Decorator
* @param tagName The tag name of the custom element to define.
*/
var customElement = (tagName) => (classOrTarget, context) => {
	if (context !== void 0) context.addInitializer(() => {
		customElements.define(tagName, classOrTarget);
	});
	else customElements.define(tagName, classOrTarget);
};
//#endregion
//#region node_modules/@lit/reactive-element/development/decorators/property.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var issueWarning$1;
globalThis.litIssuedWarnings ??= /* @__PURE__ */ new Set();
/**
* Issue a warning if we haven't already, based either on `code` or `warning`.
* Warnings are disabled automatically only by `warning`; disabling via `code`
* can be done by users.
*/
issueWarning$1 = (code, warning) => {
	warning += ` See https://lit.dev/msg/${code} for more information.`;
	if (!globalThis.litIssuedWarnings.has(warning) && !globalThis.litIssuedWarnings.has(code)) {
		console.warn(warning);
		globalThis.litIssuedWarnings.add(warning);
	}
};
var legacyProperty = (options, proto, name) => {
	const hasOwnProperty = proto.hasOwnProperty(name);
	proto.constructor.createProperty(name, options);
	return hasOwnProperty ? Object.getOwnPropertyDescriptor(proto, name) : void 0;
};
var defaultPropertyDeclaration = {
	attribute: true,
	type: String,
	converter: defaultConverter,
	reflect: false,
	hasChanged: notEqual
};
/**
* Wraps a class accessor or setter so that `requestUpdate()` is called with the
* property name and old value when the accessor is set.
*/
var standardProperty = (options = defaultPropertyDeclaration, target, context) => {
	const { kind, metadata } = context;
	if (metadata == null) issueWarning$1("missing-class-metadata", `The class ${target} is missing decorator metadata. This could mean that you're using a compiler that supports decorators but doesn't support decorator metadata, such as TypeScript 5.1. Please update your compiler.`);
	let properties = globalThis.litPropertyMetadata.get(metadata);
	if (properties === void 0) globalThis.litPropertyMetadata.set(metadata, properties = /* @__PURE__ */ new Map());
	if (kind === "setter") {
		options = Object.create(options);
		options.wrapped = true;
	}
	properties.set(context.name, options);
	if (kind === "accessor") {
		const { name } = context;
		return {
			set(v) {
				const oldValue = target.get.call(this);
				target.set.call(this, v);
				this.requestUpdate(name, oldValue, options, true, v);
			},
			init(v) {
				if (v !== void 0) this._$changeProperty(name, void 0, options, v);
				return v;
			}
		};
	} else if (kind === "setter") {
		const { name } = context;
		return function(value) {
			const oldValue = this[name];
			target.call(this, value);
			this.requestUpdate(name, oldValue, options, true, value);
		};
	}
	throw new Error(`Unsupported decorator location: ${kind}`);
};
/**
* A class field or accessor decorator which creates a reactive property that
* reflects a corresponding attribute value. When a decorated property is set
* the element will update and render. A {@linkcode PropertyDeclaration} may
* optionally be supplied to configure property features.
*
* This decorator should only be used for public fields. As public fields,
* properties should be considered as primarily settable by element users,
* either via attribute or the property itself.
*
* Generally, properties that are changed by the element should be private or
* protected fields and should use the {@linkcode state} decorator.
*
* However, sometimes element code does need to set a public property. This
* should typically only be done in response to user interaction, and an event
* should be fired informing the user; for example, a checkbox sets its
* `checked` property when clicked and fires a `changed` event. Mutating public
* properties should typically not be done for non-primitive (object or array)
* properties. In other cases when an element needs to manage state, a private
* property decorated via the {@linkcode state} decorator should be used. When
* needed, state properties can be initialized via public properties to
* facilitate complex interactions.
*
* ```ts
* class MyElement {
*   @property({ type: Boolean })
*   clicked = false;
* }
* ```
* @category Decorator
* @ExportDecoratedItems
*/
function property(options) {
	return (protoOrTarget, nameOrContext) => {
		return typeof nameOrContext === "object" ? standardProperty(options, protoOrTarget, nameOrContext) : legacyProperty(options, protoOrTarget, nameOrContext);
	};
}
//#endregion
//#region node_modules/@lit/reactive-element/development/decorators/state.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
/**
* Declares a private or protected reactive property that still triggers
* updates to the element when it changes. It does not reflect from the
* corresponding attribute.
*
* Properties declared this way must not be used from HTML or HTML templating
* systems, they're solely for properties internal to the element. These
* properties may be renamed by optimization tools like closure compiler.
* @category Decorator
*/
function state(options) {
	return property({
		...options,
		state: true,
		attribute: false
	});
}
//#endregion
//#region node_modules/@lit/reactive-element/development/decorators/base.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
/**
* Wraps up a few best practices when returning a property descriptor from a
* decorator.
*
* Marks the defined property as configurable, and enumerable, and handles
* the case where we have a busted Reflect.decorate zombiefill (e.g. in Angular
* apps).
*
* @internal
*/
var desc = (obj, name, descriptor) => {
	descriptor.configurable = true;
	descriptor.enumerable = true;
	if (Reflect.decorate && typeof name !== "object") Object.defineProperty(obj, name, descriptor);
	return descriptor;
};
//#endregion
//#region node_modules/@lit/reactive-element/development/decorators/query.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var issueWarning;
globalThis.litIssuedWarnings ??= /* @__PURE__ */ new Set();
/**
* Issue a warning if we haven't already, based either on `code` or `warning`.
* Warnings are disabled automatically only by `warning`; disabling via `code`
* can be done by users.
*/
issueWarning = (code, warning) => {
	warning += code ? ` See https://lit.dev/msg/${code} for more information.` : "";
	if (!globalThis.litIssuedWarnings.has(warning) && !globalThis.litIssuedWarnings.has(code)) {
		console.warn(warning);
		globalThis.litIssuedWarnings.add(warning);
	}
};
/**
* A property decorator that converts a class property into a getter that
* executes a querySelector on the element's renderRoot.
*
* @param selector A DOMString containing one or more selectors to match.
* @param cache An optional boolean which when true performs the DOM query only
*     once and caches the result.
*
* See: https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector
*
* ```ts
* class MyElement {
*   @query('#first')
*   first: HTMLDivElement;
*
*   render() {
*     return html`
*       <div id="first"></div>
*       <div id="second"></div>
*     `;
*   }
* }
* ```
* @category Decorator
*/
function query(selector, cache) {
	return ((protoOrTarget, nameOrContext, descriptor) => {
		const doQuery = (el) => {
			const result = el.renderRoot?.querySelector(selector) ?? null;
			if (result === null && cache && !el.hasUpdated) {
				const name = typeof nameOrContext === "object" ? nameOrContext.name : nameOrContext;
				issueWarning("", `@query'd field ${JSON.stringify(String(name))} with the 'cache' flag set for selector '${selector}' has been accessed before the first update and returned null. This is expected if the renderRoot tree has not been provided beforehand (e.g. via Declarative Shadow DOM). Therefore the value hasn't been cached.`);
			}
			return result;
		};
		if (cache) {
			const { get, set } = typeof nameOrContext === "object" ? protoOrTarget : descriptor ?? (() => {
				const key = Symbol(`${String(nameOrContext)} (@query() cache)`);
				return {
					get() {
						return this[key];
					},
					set(v) {
						this[key] = v;
					}
				};
			})();
			return desc(protoOrTarget, nameOrContext, { get() {
				let result = get.call(this);
				if (result === void 0) {
					result = doQuery(this);
					if (result !== null || this.hasUpdated) set.call(this, result);
				}
				return result;
			} });
		} else return desc(protoOrTarget, nameOrContext, { get() {
			return doQuery(this);
		} });
	});
}
//#endregion
//#region node_modules/geo-coordinates-parser/dist/mjs/regex.js
var dm_invalid = /^(NORTH|SOUTH|[NS])?\s*([+-]?[0-8]?[0-9])\s*([•º°\.:]|D(?:EG)?(?:REES)?)?\s*,?([6-9][0-9])\s*(['′´’\.:]|M(?:IN)?(?:UTES)?)?\s*(NORTH|SOUTH|[NS])?(?:\s*[,/;]\s*|\s*)(EAST|WEST|[EW])?\s*([+-]?[0-1]?[0-9]?[0-9])\s*([•º°\.:]|D(?:EG)?(?:REES)?)?\s*,?([6-9][0-9])\s*(['′´’\.:]|M(?:IN)?(?:UTES)?)?\s*(EAST|WEST|[EW])?$/i;
var dm_numbers = /^([+-]?[0-8]?[0-9])\s+([0-5]?[0-9]\.\d{3,})[\s,]{1,}([+-]?[0-1]?[0-9]?[0-9])\s+([0-5]?[0-9]\.\d{3,})$/;
var dd_re = /^(NORTH|SOUTH|[NS])?[\s]*([+-]?[0-8]?[0-9](?:[\.,]\d{3,}))[\s]*([•º°]?)[\s]*(NORTH|SOUTH|[NS])?[\s]*[,/;]?[\s]*(EAST|WEST|[EW])?[\s]*([+-]?[0-1]?[0-9]?[0-9](?:[\.,]\d{3,}))[\s]*([•º°]?)[\s]*(EAST|WEST|[EW])?$/i;
var dms_periods = /^(NORTH|SOUTH|[NS])?\s*([+-]?[0-8]?[0-9])\s*(\.)\s*([0-5]?[0-9])\s*(\.)\s*((?:[0-5]?[0-9])(?:[\.,]\d{1,3})?)?\s*(NORTH|SOUTH|[NS])?(?:\s*[,/;]\s*|\s*)(EAST|WEST|[EW])?\s*([+-]?[0-1]?[0-9]?[0-9])\s*(\.)\s*([0-5]?[0-9])\s*(\.)\s*((?:[0-5]?[0-9])(?:[\.,]\d{1,3})?)?\s*(EAST|WEST|[EW])?$/i;
var dms_abbr = /^(NORTH|SOUTH|[NS])?\s*([+-]?[0-8]?[0-9])\s*(D(?:EG)?(?:REES)?)\s*([0-5]?[0-9])\s*(M(?:IN)?(?:UTES)?)\s*((?:[0-5]?[0-9])(?:[\.,]\d{1,3})?)?\s*(S(?:EC)?(?:ONDS)?)?\s*(NORTH|SOUTH|[NS])?(?:\s*[,/;]\s*|\s*)(EAST|WEST|[EW])?\s*([+-]?[0-1]?[0-9]?[0-9])\s*(D(?:EG)?(?:REES)?)\s*([0-5]?[0-9])\s*(M(?:IN)?(?:UTES)?)\s*((?:[0-5]?[0-9])(?:[\.,]\d{1,3})?)?\s*(S(?:EC)?(?:ONDS)?)\s*(EAST|WEST|[EW])?$/i;
var coords_other = /^(NORTH|SOUTH|[NS])?\s*([+-]?[0-8]?[0-9])\s*([•º°\.:]|D(?:EG)?(?:REES)?)?\s*,?([0-5]?[0-9](?:[\.,]\d{1,})?)?\s*(['′´’\.:]|M(?:IN)?(?:UTES)?)?\s*,?((?:[0-5]?[0-9])(?:[\.,]\d{1,3})?)?\s*(''|′′|’’|´´|["″”\.])?\s*(NORTH|SOUTH|[NS])?(?:\s*[,/;]\s*|\s*)(EAST|WEST|[EW])?\s*([+-]?[0-1]?[0-9]?[0-9])\s*([•º°\.:]|D(?:EG)?(?:REES)?)?\s*,?([0-5]?[0-9](?:[\.,]\d{1,})?)?\s*(['′´’\.:]|M(?:IN)?(?:UTES)?)?\s*,?((?:[0-5]?[0-9])(?:[\.,]\d{1,3})?)?\s*(''|′′|´´|’’|["″”\.])?\s*(EAST|WEST|[EW])?$/i;
//#endregion
//#region node_modules/geo-coordinates-parser/dist/mjs/toCoordinateFormat.js
/**
* Converts decimalCoordinates to commonly used string formats
* Note that this will add degree and direction symbols to decimal coordinates
* @param {string} format Either DMS or DM
* @returns {string}
*/
function toCoordinateFormat(format) {
	if (![
		"DMS",
		"DM",
		"DD"
	].includes(format)) throw new Error("invalid format specified");
	if (this.decimalCoordinates && this.decimalCoordinates.trim()) {
		const parts = this.decimalCoordinates.split(",").map((x) => Number(x.trim()));
		const decimalLatitude = Number(parts[0]);
		const decimalLongitude = Number(parts[1]);
		const absoluteLatitude = Math.abs(decimalLatitude);
		const absoluteLongitude = Math.abs(decimalLongitude);
		const latDir = decimalLatitude > 0 ? "N" : "S";
		const longDir = decimalLongitude > 0 ? "E" : "W";
		let result;
		if (format == "DD") result = `${absoluteLatitude}° ${latDir}, ${absoluteLongitude}° ${longDir}`;
		const degreesLatitude = Math.floor(absoluteLatitude);
		const degreesLongitude = Math.floor(absoluteLongitude);
		const minutesLatitudeNotTruncated = (absoluteLatitude - degreesLatitude) * 60;
		const minutesLongitudeNotTruncated = (absoluteLongitude - degreesLongitude) * 60;
		if (format == "DM") {
			let dmMinsLatitude = round(minutesLatitudeNotTruncated, 3).toFixed(3).padStart(6, "0");
			let dmMinsLongitude = round(minutesLongitudeNotTruncated, 3).toFixed(3).padStart(6, "0");
			if (dmMinsLatitude.endsWith(".000") && dmMinsLongitude.endsWith(".000")) {
				dmMinsLatitude = dmMinsLatitude.replace(/\.000$/, "");
				dmMinsLongitude = dmMinsLongitude.replace(/\.000$/, "");
			}
			result = `${degreesLatitude}° ${dmMinsLatitude}' ${latDir}, ${degreesLongitude}° ${dmMinsLongitude}' ${longDir}`;
		}
		if (format == "DMS") {
			const latMinutes = Math.floor(minutesLatitudeNotTruncated);
			const longMinutes = Math.floor(minutesLongitudeNotTruncated);
			let latSeconds = ((minutesLatitudeNotTruncated - latMinutes) * 60).toFixed(1).padStart(4, "0");
			let longSeconds = ((minutesLongitudeNotTruncated - longMinutes) * 60).toFixed(1).padStart(4, "0");
			const latMinutesString = latMinutes.toString().padStart(2, "0");
			const longMinutesString = longMinutes.toString().padStart(2, "0");
			if (latSeconds.endsWith(".0") && longSeconds.endsWith(".0")) {
				latSeconds = latSeconds.replace(/\.0$/, "");
				longSeconds = longSeconds.replace(/\.0$/, "");
			}
			result = `${degreesLatitude}° ${latMinutesString}' ${latSeconds}" ${latDir}, ${degreesLongitude}° ${longMinutesString}' ${longSeconds}" ${longDir}`;
		}
		return result;
	} else throw new Error("no decimal coordinates to convert");
}
function round(num, places) {
	const d = Math.pow(10, places);
	return Math.round((num + Number.EPSILON) * d) / d;
}
//#endregion
//#region node_modules/geo-coordinates-parser/dist/mjs/converter.js
/**
* Function for converting coordinates in a variety of formats to decimal coordinates
* @param {string} coordsString The coordinates string to convert
* @param {number} [decimalPlaces] The number of decimal places for converted coordinates; default is 5
* @returns {{verbatimCoordinates: string, decimalCoordinates: string, decimalLatitude: number, decimalLongitude: number, closeEnough: function(string): boolean, toCoordinateFormat: toCoordinateFormat}}
*/
function converter(coordsString, decimalPlaces) {
	if (!decimalPlaces) decimalPlaces = 5;
	coordsString = coordsString.replace(/\s+/g, " ").trim();
	let ddLat = null;
	let ddLng = null;
	let latdir = "";
	let lngdir = "";
	let originalFormat = null;
	let match = [];
	let matchSuccess = false;
	if (dm_invalid.test(coordsString)) throw new Error("invalid coordinate value");
	if (dm_numbers.test(coordsString)) {
		match = dm_numbers.exec(coordsString);
		matchSuccess = checkMatch(match);
		if (matchSuccess) {
			ddLat = Math.abs(match[1]) + match[2] / 60;
			if (Number(match[1]) < 0) ddLat *= -1;
			ddLng = Math.abs(match[3]) + match[4] / 60;
			if (Number(match[3]) < 0) ddLng *= -1;
			originalFormat = "DM";
		} else throw new Error("invalid coordinate format");
	} else if (dd_re.test(coordsString)) {
		match = dd_re.exec(coordsString);
		matchSuccess = checkMatch(match);
		if (matchSuccess) {
			ddLat = match[2];
			ddLng = match[6];
			if (ddLat.includes(",")) ddLat = ddLat.replace(",", ".");
			if (ddLng.includes(",")) ddLng = ddLng.replace(",", ".");
			originalFormat = "DD";
			if (Number(Math.round(ddLat)) == Number(ddLat)) throw new Error("integer only coordinate provided");
			if (Number(Math.round(ddLng)) == Number(ddLng)) throw new Error("integer only coordinate provided");
			if (match[1]) {
				latdir = match[1];
				lngdir = match[5];
			} else if (match[4]) {
				latdir = match[4];
				lngdir = match[8];
			}
		} else throw new Error("invalid decimal coordinate format");
	} else if (dms_periods.test(coordsString)) {
		match = dms_periods.exec(coordsString);
		matchSuccess = checkMatch(match);
		if (matchSuccess) {
			ddLat = Math.abs(parseInt(match[2]));
			if (match[4]) {
				ddLat += match[4] / 60;
				originalFormat = "DM";
			}
			if (match[6]) {
				ddLat += match[6].replace(",", ".") / 3600;
				originalFormat = "DMS";
			}
			if (parseInt(match[2]) < 0) ddLat = -1 * ddLat;
			ddLng = Math.abs(parseInt(match[9]));
			if (match[11]) ddLng += match[11] / 60;
			if (match[13]) ddLng += match[13].replace(",", ".") / 3600;
			if (parseInt(match[9]) < 0) ddLng = -1 * ddLng;
			if (match[1]) {
				latdir = match[1];
				lngdir = match[8];
			} else if (match[7]) {
				latdir = match[7];
				lngdir = match[14];
			}
		} else throw new Error("invalid DMS coordinates format");
	} else if (dms_abbr.test(coordsString)) {
		match = dms_abbr.exec(coordsString);
		matchSuccess = checkMatch(match);
		if (matchSuccess) {
			ddLat = Math.abs(parseInt(match[2]));
			if (match[4]) {
				ddLat += match[4] / 60;
				originalFormat = "DM";
			}
			if (match[6]) {
				ddLat += match[6] / 3600;
				originalFormat = "DMS";
			}
			if (parseInt(match[2]) < 0) ddLat = -1 * ddLat;
			ddLng = Math.abs(parseInt(match[10]));
			if (match[12]) ddLng += match[12] / 60;
			if (match[14]) ddLng += match[14] / 3600;
			if (parseInt(match[10]) < 0) ddLng = -1 * ddLng;
			if (match[1]) {
				latdir = match[1];
				lngdir = match[9];
			} else if (match[8]) {
				latdir = match[8];
				lngdir = match[16];
			}
		} else throw new Error("invalid DMS coordinates format");
	} else if (coords_other.test(coordsString)) {
		match = coords_other.exec(coordsString);
		matchSuccess = checkMatch(match);
		if (match.filter((x) => x).length <= 5) throw new Error("invalid coordinates format");
		if (matchSuccess) {
			ddLat = Math.abs(parseInt(match[2]));
			if (match[4]) {
				ddLat += match[4].replace(",", ".") / 60;
				originalFormat = "DM";
			}
			if (match[6]) {
				ddLat += match[6].replace(",", ".") / 3600;
				originalFormat = "DMS";
			}
			if (parseInt(match[2]) < 0) ddLat = -1 * ddLat;
			ddLng = Math.abs(parseInt(match[10]));
			if (match[12]) ddLng += match[12].replace(",", ".") / 60;
			if (match[14]) ddLng += match[14].replace(",", ".") / 3600;
			if (parseInt(match[10]) < 0) ddLng = -1 * ddLng;
			if (match[1]) {
				latdir = match[1];
				lngdir = match[9];
			} else if (match[8]) {
				latdir = match[8];
				lngdir = match[16];
			}
		} else throw new Error("invalid coordinates format");
	}
	if (matchSuccess) {
		if (Math.abs(ddLng) >= 180) throw new Error("invalid longitude value");
		if (Math.abs(ddLat) >= 90) throw new Error("invalid latitude value");
		if (latdir && !lngdir || !latdir && lngdir) throw new Error("invalid coordinates value");
		if (latdir && latdir == lngdir) throw new Error("invalid coordinates format");
		if (ddLat.toString().includes(",")) ddLat = ddLat.replace(",", ".");
		if (ddLng.toString().includes(",")) ddLng = ddLng.replace(",", ".");
		let patt = /S|SOUTH/i;
		if (patt.test(latdir)) {
			if (ddLat > 0) ddLat = -1 * ddLat;
		}
		patt = /W|WEST/i;
		if (patt.test(lngdir)) {
			if (ddLng > 0) ddLng = -1 * ddLng;
		}
		const verbatimCoordinates = match[0].trim();
		let verbatimLat;
		let verbatimLng;
		const seps = verbatimCoordinates.match(/[,/;\u0020]/g);
		if (seps == null) {
			const middle = Math.floor(coordsString.length / 2);
			verbatimLat = verbatimCoordinates.substring(0, middle).trim();
			verbatimLng = verbatimCoordinates.substring(middle).trim();
		} else {
			let middle;
			if (seps.length % 2 == 1) middle = Math.floor(seps.length / 2);
			else middle = seps.length / 2 - 1;
			let splitIndex = 0;
			if (middle == 0) {
				splitIndex = verbatimCoordinates.indexOf(seps[0]);
				verbatimLat = verbatimCoordinates.substring(0, splitIndex).trim();
				verbatimLng = verbatimCoordinates.substring(splitIndex + 1).trim();
			} else {
				let currSepIndex = 0;
				let startSearchIndex = 0;
				while (currSepIndex <= middle) {
					splitIndex = verbatimCoordinates.indexOf(seps[currSepIndex], startSearchIndex);
					startSearchIndex = splitIndex + 1;
					currSepIndex++;
				}
				verbatimLat = verbatimCoordinates.substring(0, splitIndex).trim();
				verbatimLng = verbatimCoordinates.substring(splitIndex + 1).trim();
			}
		}
		const splitLat = verbatimLat.split(".");
		if (splitLat.length == 2) {
			if (splitLat[1] == 0 && splitLat[1].length != 2) throw new Error("invalid coordinates format");
		}
		const splitLon = verbatimLng.split(".");
		if (splitLon.length == 2) {
			if (splitLon[1] == 0 && splitLon[1].length != 2) throw new Error("invalid coordinates format");
		}
		if (/^\d+$/.test(verbatimLat) || /^\d+$/.test(verbatimLng)) throw new Error("degree only coordinate/s provided");
		ddLat = Number(Number(ddLat).toFixed(decimalPlaces));
		ddLng = Number(Number(ddLng).toFixed(decimalPlaces));
		return Object.freeze({
			verbatimCoordinates,
			verbatimLatitude: verbatimLat,
			verbatimLongitude: verbatimLng,
			decimalLatitude: ddLat,
			decimalLongitude: ddLng,
			decimalCoordinates: `${ddLat},${ddLng}`,
			originalFormat,
			closeEnough: coordsCloseEnough,
			toCoordinateFormat
		});
	} else throw new Error("coordinates pattern match failed");
}
function checkMatch(match) {
	if (!isNaN(match[0])) return false;
	const filteredMatch = [...match];
	filteredMatch.shift();
	if (filteredMatch.length % 2 > 0) return false;
	const numerictest = /^[-+]?\d+([\.,]\d+)?$/;
	const stringtest = /[eastsouthnorthwest]+/i;
	const halflen = filteredMatch.length / 2;
	for (let i = 0; i < halflen; i++) {
		const leftside = filteredMatch[i];
		const rightside = filteredMatch[i + halflen];
		const bothAreNumbers = numerictest.test(leftside) && numerictest.test(rightside);
		const bothAreStrings = stringtest.test(leftside) && stringtest.test(rightside);
		const valuesAreEqual = leftside == rightside;
		if (leftside == void 0 && rightside == void 0) continue;
		else if (leftside == void 0 || rightside == void 0) return false;
		else if (bothAreNumbers || bothAreStrings || valuesAreEqual) continue;
		else return false;
	}
	return true;
}
function decimalsCloseEnough(dec1, dec2) {
	const originaldiff = Math.abs(dec1 - dec2);
	if (Number(originaldiff.toFixed(6)) <= 1e-5) return true;
	else return false;
}
function coordsCloseEnough(coordsToTest) {
	if (!coordsToTest) throw new Error("coords must be provided");
	if (coordsToTest.includes(",")) {
		const coords = coordsToTest.split(",");
		if (Number(coords[0]) == NaN || Number(coords[1]) == NaN) throw new Error("coords are not valid decimals");
		else return decimalsCloseEnough(this.decimalLatitude, Number(coords[0])) && decimalsCloseEnough(this.decimalLongitude, coords[1]);
	} else throw new Error("coords being tested must be separated by a comma");
}
converter.to = Object.freeze({
	DMS: "DMS",
	DM: "DM",
	DD: "DD"
});
//#endregion
//#region node_modules/geo-coordinates-parser/dist/mjs/tests/testformats.js
var coordsParserFormats = [
	{
		verbatimCoordinates: "40.123, -74.123",
		verbatimLatitude: "40.123",
		verbatimLongitude: "-74.123"
	},
	{
		verbatimCoordinates: "40.123° N 74.123° W",
		verbatimLatitude: "40.123° N",
		verbatimLongitude: "74.123° W"
	},
	{
		verbatimCoordinates: "40.123° N 74.123° W",
		verbatimLatitude: "40.123° N",
		verbatimLongitude: "74.123° W"
	},
	{
		verbatimCoordinates: "40° 7´ 22.8\" N 74° 7´ 22.8\" W",
		verbatimLatitude: "40° 7´ 22.8\" N",
		verbatimLongitude: "74° 7´ 22.8\" W"
	},
	{
		verbatimCoordinates: "40° 7.38’ , -74° 7.38’",
		verbatimLatitude: "40° 7.38’",
		verbatimLongitude: "-74° 7.38’"
	},
	{
		verbatimCoordinates: "N40°7’22.8’’, W74°7’22.8’’",
		verbatimLatitude: "N40°7’22.8’’",
		verbatimLongitude: "W74°7’22.8’’"
	},
	{
		verbatimCoordinates: "40°7’22.8\"N, 74°7’22.8\"W",
		verbatimLatitude: "40°7’22.8\"N",
		verbatimLongitude: "74°7’22.8\"W"
	},
	{
		verbatimCoordinates: "40°7'22.8\"N, 74°7'22.8\"W",
		verbatimLatitude: "40°7'22.8\"N",
		verbatimLongitude: "74°7'22.8\"W"
	},
	{
		verbatimCoordinates: "40 7 22.8, -74 7 22.8",
		verbatimLatitude: "40 7 22.8",
		verbatimLongitude: "-74 7 22.8"
	},
	{
		verbatimCoordinates: "40.123 -74.123",
		verbatimLatitude: "40.123",
		verbatimLongitude: "-74.123"
	},
	{
		verbatimCoordinates: "40.123°,-74.123°",
		verbatimLatitude: "40.123°",
		verbatimLongitude: "-74.123°"
	},
	{
		verbatimCoordinates: "40.123N74.123W",
		verbatimLatitude: "40.123N",
		verbatimLongitude: "74.123W"
	},
	{
		verbatimCoordinates: "4007.38N7407.38W",
		verbatimLatitude: "4007.38N",
		verbatimLongitude: "7407.38W"
	},
	{
		verbatimCoordinates: "40°7’22.8\"N, 74°7’22.8\"W",
		verbatimLatitude: "40°7’22.8\"N",
		verbatimLongitude: "74°7’22.8\"W"
	},
	{
		verbatimCoordinates: "400722.8N740722.8W",
		verbatimLatitude: "400722.8N",
		verbatimLongitude: "740722.8W"
	},
	{
		verbatimCoordinates: "N 40 7.38 W 74 7.38",
		verbatimLatitude: "N 40 7.38",
		verbatimLongitude: "W 74 7.38"
	},
	{
		verbatimCoordinates: "40:7:22.8N 74:7:22.8W",
		verbatimLatitude: "40:7:22.8N",
		verbatimLongitude: "74:7:22.8W"
	},
	{
		verbatimCoordinates: "40:7:23N,74:7:23W",
		verbatimLatitude: "40:7:23N",
		verbatimLongitude: "74:7:23W",
		decimalLatitude: 40.1230555555,
		decimalLongitude: -74.1230555555
	},
	{
		verbatimCoordinates: "40°7’23\"N 74°7’23\"W",
		verbatimLatitude: "40°7’23\"N",
		verbatimLongitude: "74°7’23\"W",
		decimalLatitude: 40.1230555555,
		decimalLongitude: -74.12305555555555
	},
	{
		verbatimCoordinates: "40°7’23\"S 74°7’23\"E",
		verbatimLatitude: "40°7’23\"S",
		verbatimLongitude: "74°7’23\"E",
		decimalLatitude: -40.1230555555,
		decimalLongitude: 74.12305555555555
	},
	{
		verbatimCoordinates: "40°7’23\" -74°7’23\"",
		verbatimLatitude: "40°7’23\"",
		verbatimLongitude: "-74°7’23\"",
		decimalLatitude: 40.1230555555,
		decimalLongitude: -74.123055555
	},
	{
		verbatimCoordinates: "40d 7’ 23\" N 74d 7’ 23\" W",
		verbatimLatitude: "40d 7’ 23\" N",
		verbatimLongitude: "74d 7’ 23\" W",
		decimalLatitude: 40.1230555555,
		decimalLongitude: -74.123055555
	},
	{
		verbatimCoordinates: "40.123N 74.123W",
		verbatimLatitude: "40.123N",
		verbatimLongitude: "74.123W"
	},
	{
		verbatimCoordinates: "40° 7.38, -74° 7.38",
		verbatimLatitude: "40° 7.38",
		verbatimLongitude: "-74° 7.38"
	},
	{
		verbatimCoordinates: "40° 7.38, -74° 7.38",
		verbatimLatitude: "40° 7.38",
		verbatimLongitude: "-74° 7.38"
	},
	{
		verbatimCoordinates: "40 7 22.8; -74 7 22.8",
		verbatimLatitude: "40 7 22.8",
		verbatimLongitude: "-74 7 22.8"
	}
];
var coordsParserDecimals = {
	decimalLatitude: 40.123,
	decimalLongitude: -74.123
};
var coordsRegexFormats = [
	{
		verbatimCoordinates: "50°4'17.698\"south, 14°24'2.826\"east",
		verbatimLatitude: "50°4'17.698\"south",
		verbatimLongitude: "14°24'2.826\"east",
		decimalLatitude: -50.07158277777778,
		decimalLongitude: 14.400785
	},
	{
		verbatimCoordinates: "50d4m17.698S 14d24m2.826E",
		verbatimLatitude: "50d4m17.698S",
		verbatimLongitude: "14d24m2.826E",
		decimalLatitude: -50.07158277777778,
		decimalLongitude: 14.400785
	},
	{
		verbatimCoordinates: "40:26:46N,79:56:55W",
		verbatimLatitude: "40:26:46N",
		verbatimLongitude: "79:56:55W",
		decimalLatitude: 40.44611111111111,
		decimalLongitude: -79.9486111111111
	},
	{
		verbatimCoordinates: "40:26:46.302N 79:56:55.903W",
		verbatimLatitude: "40:26:46.302N",
		verbatimLongitude: "79:56:55.903W",
		decimalLatitude: 40.446195,
		decimalLongitude: -79.94886194444445
	},
	{
		verbatimCoordinates: "40°26′47″N 79°58′36″W",
		verbatimLatitude: "40°26′47″N",
		verbatimLongitude: "79°58′36″W",
		decimalLatitude: 40.44638888888889,
		decimalLongitude: -79.97666666666667
	},
	{
		verbatimCoordinates: "40d 26′ 47″ N 79d 58′ 36″ W",
		verbatimLatitude: "40d 26′ 47″ N",
		verbatimLongitude: "79d 58′ 36″ W",
		decimalLatitude: 40.44638888888889,
		decimalLongitude: -79.97666666666667
	},
	{
		verbatimCoordinates: "40.446195N 79.948862W",
		verbatimLatitude: "40.446195N",
		verbatimLongitude: "79.948862W",
		decimalLatitude: 40.446195,
		decimalLongitude: -79.948862
	},
	{
		verbatimCoordinates: "40,446195° 79,948862°",
		verbatimLatitude: "40,446195°",
		verbatimLongitude: "79,948862°",
		decimalLatitude: 40.446195,
		decimalLongitude: 79.948862
	},
	{
		verbatimCoordinates: "40° 26.7717, -79° 56.93172",
		verbatimLatitude: "40° 26.7717",
		verbatimLongitude: "-79° 56.93172",
		decimalLatitude: 40.446195,
		decimalLongitude: -79.948862
	},
	{
		verbatimCoordinates: "40.446195, -79.948862",
		verbatimLatitude: "40.446195",
		verbatimLongitude: "-79.948862",
		decimalLatitude: 40.446195,
		decimalLongitude: -79.948862
	},
	{
		verbatimCoordinates: "40.123256; -74.123256",
		verbatimLatitude: "40.123256",
		verbatimLongitude: "-74.123256",
		decimalLatitude: 40.123256,
		decimalLongitude: -74.123256
	},
	{
		verbatimCoordinates: "18°24S 22°45E",
		verbatimLatitude: "18°24S",
		verbatimLongitude: "22°45E",
		decimalLatitude: -18.4,
		decimalLongitude: 22.75
	}
];
var otherFormats = [
	{
		verbatimCoordinates: "10.432342S 10.6345345E",
		verbatimLatitude: "10.432342S",
		verbatimLongitude: "10.6345345E",
		decimalLatitude: -10.432342,
		decimalLongitude: 10.6345345
	},
	{
		verbatimCoordinates: "10.00S 10.00E",
		verbatimLatitude: "10.00S",
		verbatimLongitude: "10.00E",
		decimalLatitude: -10,
		decimalLongitude: 10
	},
	{
		verbatimCoordinates: "00.00S 01.00E",
		verbatimLatitude: "00.00S",
		verbatimLongitude: "01.00E",
		decimalLatitude: 0,
		decimalLongitude: 1
	},
	{
		verbatimCoordinates: "18.24S 22.45E",
		verbatimLatitude: "18.24S",
		verbatimLongitude: "22.45E",
		decimalLatitude: -18.4,
		decimalLongitude: 22.75
	},
	{
		verbatimCoordinates: "27deg 15min 45.2sec S 18deg 32min 53.7sec E",
		verbatimLatitude: "27deg 15min 45.2sec S",
		verbatimLongitude: "18deg 32min 53.7sec E",
		decimalLatitude: -27.262555555555554,
		decimalLongitude: 18.54825
	},
	{
		verbatimCoordinates: "-23.3245° S / 28.2344° E",
		verbatimLatitude: "-23.3245° S",
		verbatimLongitude: "28.2344° E",
		decimalLatitude: -23.3245,
		decimalLongitude: 28.2344
	},
	{
		verbatimCoordinates: "40° 26.7717 -79° 56.93172",
		verbatimLatitude: "40° 26.7717",
		verbatimLongitude: "-79° 56.93172",
		decimalLatitude: 40.446195,
		decimalLongitude: -79.948862
	},
	{
		verbatimCoordinates: "27.15.45S 18.32.53E",
		verbatimLatitude: "27.15.45S",
		verbatimLongitude: "18.32.53E",
		decimalLatitude: -27.2625,
		decimalLongitude: 18.548055
	},
	{
		verbatimCoordinates: "-27.15.45 18.32.53",
		verbatimLatitude: "-27.15.45",
		verbatimLongitude: "18.32.53",
		decimalLatitude: -27.2625,
		decimalLongitude: 18.548055
	},
	{
		verbatimCoordinates: "27.15.45.2S 18.32.53.4E",
		verbatimLatitude: "27.15.45.2S",
		verbatimLongitude: "18.32.53.4E",
		decimalLatitude: -27.262556,
		decimalLongitude: 18.548167
	},
	{
		verbatimCoordinates: "27.15.45,2S 18.32.53,4E",
		verbatimLatitude: "27.15.45,2S",
		verbatimLongitude: "18.32.53,4E",
		decimalLatitude: -27.262556,
		decimalLongitude: 18.548167
	},
	{
		verbatimCoordinates: "S23.43563 °  E22.45634 °",
		verbatimLatitude: "S23.43563 °",
		verbatimLongitude: "E22.45634 °",
		decimalLatitude: -23.43563,
		decimalLongitude: 22.45634
	},
	{
		verbatimCoordinates: "27,71372° S 23,07771° E",
		verbatimLatitude: "27,71372° S",
		verbatimLongitude: "23,07771° E",
		decimalLatitude: -27.71372,
		decimalLongitude: 23.07771
	},
	{
		verbatimCoordinates: "27.45.34 S 23.23.23 E",
		verbatimLatitude: "27.45.34 S",
		verbatimLongitude: "23.23.23 E",
		decimalLatitude: -27.759444,
		decimalLongitude: 23.38972222
	},
	{
		verbatimCoordinates: "S 27.45.34 E 23.23.23",
		verbatimLatitude: "S 27.45.34",
		verbatimLongitude: "E 23.23.23",
		decimalLatitude: -27.759444,
		decimalLongitude: 23.38972222
	},
	{
		verbatimCoordinates: "53 16.3863,4 52.8171",
		verbatimLatitude: "53 16.3863",
		verbatimLongitude: "4 52.8171",
		decimalLatitude: 53.273105,
		decimalLongitude: 4.88029
	},
	{
		verbatimCoordinates: "50 8.2914,-5 2.4447",
		verbatimLatitude: "50 8.2914",
		verbatimLongitude: "-5 2.4447",
		decimalLatitude: 50.13819,
		decimalLongitude: -5.040745
	},
	{
		verbatimCoordinates: `N 48° 30,6410', E 18° 57,4583'`,
		verbatimLatitude: `N 48° 30,6410'`,
		verbatimLongitude: `E 18° 57,4583'`,
		decimalLatitude: 48.51068,
		decimalLongitude: 18.95764
	},
	{
		verbatimCoordinates: `1.23456, 18.33453`,
		verbatimLatitude: `1.23456`,
		verbatimLongitude: `18.33453`,
		decimalLatitude: 1.23456,
		decimalLongitude: 18.33453
	}
];
function getAllTestFormats() {
	const arr1 = [];
	coordsParserFormats.forEach((item) => {
		if (item.decimalLatitude) arr1.push(item);
		else arr1.push({
			...item,
			...coordsParserDecimals
		});
	});
	return [
		...arr1,
		...coordsRegexFormats,
		...otherFormats
	];
}
//#endregion
//#region node_modules/geo-coordinates-parser/dist/mjs/merge.js
converter.formats = getAllTestFormats().map((format) => format.verbatimCoordinates);
var convert = converter;
//#endregion
//#region node_modules/lit-html/development/directive.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var PartType = {
	ATTRIBUTE: 1,
	CHILD: 2,
	PROPERTY: 3,
	BOOLEAN_ATTRIBUTE: 4,
	EVENT: 5,
	ELEMENT: 6
};
/**
* Creates a user-facing directive function from a Directive class. This
* function has the same parameters as the directive's render() method.
*/
var directive = (c) => (...values) => ({
	["_$litDirective$"]: c,
	values
});
/**
* Base class for creating custom directives. Users should extend this class,
* implement `render` and/or `update`, and then pass their subclass to
* `directive`.
*/
var Directive = class {
	constructor(_partInfo) {}
	get _$isConnected() {
		return this._$parent._$isConnected;
	}
	/** @internal */
	_$initialize(part, parent, attributeIndex) {
		this.__part = part;
		this._$parent = parent;
		this.__attributeIndex = attributeIndex;
	}
	/** @internal */
	_$resolve(part, props) {
		return this.update(part, props);
	}
	update(_part, props) {
		return this.render(...props);
	}
};
//#endregion
//#region node_modules/lit-html/development/directives/class-map.js
/**
* @license
* Copyright 2018 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var ClassMapDirective = class extends Directive {
	constructor(partInfo) {
		super(partInfo);
		if (partInfo.type !== PartType.ATTRIBUTE || partInfo.name !== "class" || partInfo.strings?.length > 2) throw new Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.");
	}
	render(classInfo) {
		return " " + Object.keys(classInfo).filter((key) => classInfo[key]).join(" ") + " ";
	}
	update(part, [classInfo]) {
		if (this._previousClasses === void 0) {
			this._previousClasses = /* @__PURE__ */ new Set();
			if (part.strings !== void 0) this._staticClasses = new Set(part.strings.join(" ").split(/\s/).filter((s) => s !== ""));
			for (const name in classInfo) if (classInfo[name] && !this._staticClasses?.has(name)) this._previousClasses.add(name);
			return this.render(classInfo);
		}
		const classList = part.element.classList;
		for (const name of this._previousClasses) if (!(name in classInfo)) {
			classList.remove(name);
			this._previousClasses.delete(name);
		}
		for (const name in classInfo) {
			const value = !!classInfo[name];
			if (value !== this._previousClasses.has(name) && !this._staticClasses?.has(name)) if (value) {
				classList.add(name);
				this._previousClasses.add(name);
			} else {
				classList.remove(name);
				this._previousClasses.delete(name);
			}
		}
		return noChange;
	}
};
/**
* A directive that applies dynamic CSS classes.
*
* This must be used in the `class` attribute and must be the only part used in
* the attribute. It takes each property in the `classInfo` argument and adds
* the property name to the element's `classList` if the property value is
* truthy; if the property value is falsy, the property name is removed from
* the element's `class`.
*
* For example `{foo: bar}` applies the class `foo` if the value of `bar` is
* truthy.
*
* @param classInfo
*/
var classMap = directive(ClassMapDirective);
//#endregion
//#region node_modules/lit-html/development/directive-helpers.js
/**
* @license
* Copyright 2020 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var { _ChildPart: ChildPart } = _$LH;
var wrap = window.ShadyDOM?.inUse && window.ShadyDOM?.noPatch === true ? window.ShadyDOM.wrap : (node) => node;
var createMarker = () => document.createComment("");
/**
* Inserts a ChildPart into the given container ChildPart's DOM, either at the
* end of the container ChildPart, or before the optional `refPart`.
*
* This does not add the part to the containerPart's committed value. That must
* be done by callers.
*
* @param containerPart Part within which to add the new ChildPart
* @param refPart Part before which to add the new ChildPart; when omitted the
*     part added to the end of the `containerPart`
* @param part Part to insert, or undefined to create a new part
*/
var insertPart = (containerPart, refPart, part) => {
	const container = wrap(containerPart._$startNode).parentNode;
	const refNode = refPart === void 0 ? containerPart._$endNode : refPart._$startNode;
	if (part === void 0) part = new ChildPart(wrap(container).insertBefore(createMarker(), refNode), wrap(container).insertBefore(createMarker(), refNode), containerPart, containerPart.options);
	else {
		const endNode = wrap(part._$endNode).nextSibling;
		const oldParent = part._$parent;
		const parentChanged = oldParent !== containerPart;
		if (parentChanged) {
			part._$reparentDisconnectables?.(containerPart);
			part._$parent = containerPart;
			let newConnectionState;
			if (part._$notifyConnectionChanged !== void 0 && (newConnectionState = containerPart._$isConnected) !== oldParent._$isConnected) part._$notifyConnectionChanged(newConnectionState);
		}
		if (endNode !== refNode || parentChanged) {
			let start = part._$startNode;
			while (start !== endNode) {
				const n = wrap(start).nextSibling;
				wrap(container).insertBefore(start, refNode);
				start = n;
			}
		}
	}
	return part;
};
/**
* Sets the value of a Part.
*
* Note that this should only be used to set/update the value of user-created
* parts (i.e. those created using `insertPart`); it should not be used
* by directives to set the value of the directive's container part. Directives
* should return a value from `update`/`render` to update their part state.
*
* For directives that require setting their part value asynchronously, they
* should extend `AsyncDirective` and call `this.setValue()`.
*
* @param part Part to set
* @param value Value to set
* @param index For `AttributePart`s, the index to set
* @param directiveParent Used internally; should not be set by user
*/
var setChildPartValue = (part, value, directiveParent = part) => {
	part._$setValue(value, directiveParent);
	return part;
};
var RESET_VALUE = {};
/**
* Sets the committed value of a ChildPart directly without triggering the
* commit stage of the part.
*
* This is useful in cases where a directive needs to update the part such
* that the next update detects a value change or not. When value is omitted,
* the next update will be guaranteed to be detected as a change.
*
* @param part
* @param value
*/
var setCommittedValue = (part, value = RESET_VALUE) => part._$committedValue = value;
/**
* Returns the committed value of a ChildPart.
*
* The committed value is used for change detection and efficient updates of
* the part. It can differ from the value set by the template or directive in
* cases where the template value is transformed before being committed.
*
* - `TemplateResult`s are committed as a `TemplateInstance`
* - Iterables are committed as `Array<ChildPart>`
* - All other types are committed as the template value or value returned or
*   set by a directive.
*
* @param part
*/
var getCommittedValue = (part) => part._$committedValue;
/**
* Removes a ChildPart from the DOM, including any of its content and markers.
*
* Note: The only difference between this and clearPart() is that this also
* removes the part's start node. This means that the ChildPart must own its
* start node, ie it must be a marker node specifically for this part and not an
* anchor from surrounding content.
*
* @param part The Part to remove
*/
var removePart = (part) => {
	part._$clear();
	part._$startNode.remove();
};
//#endregion
//#region node_modules/lit-html/development/directives/repeat.js
/**
* @license
* Copyright 2017 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var generateMap = (list, start, end) => {
	const map = /* @__PURE__ */ new Map();
	for (let i = start; i <= end; i++) map.set(list[i], i);
	return map;
};
var RepeatDirective = class extends Directive {
	constructor(partInfo) {
		super(partInfo);
		if (partInfo.type !== PartType.CHILD) throw new Error("repeat() can only be used in text expressions");
	}
	_getValuesAndKeys(items, keyFnOrTemplate, template) {
		let keyFn;
		if (template === void 0) template = keyFnOrTemplate;
		else if (keyFnOrTemplate !== void 0) keyFn = keyFnOrTemplate;
		const keys = [];
		const values = [];
		let index = 0;
		for (const item of items) {
			keys[index] = keyFn ? keyFn(item, index) : index;
			values[index] = template(item, index);
			index++;
		}
		return {
			values,
			keys
		};
	}
	render(items, keyFnOrTemplate, template) {
		return this._getValuesAndKeys(items, keyFnOrTemplate, template).values;
	}
	update(containerPart, [items, keyFnOrTemplate, template]) {
		const oldParts = getCommittedValue(containerPart);
		const { values: newValues, keys: newKeys } = this._getValuesAndKeys(items, keyFnOrTemplate, template);
		if (!Array.isArray(oldParts)) {
			this._itemKeys = newKeys;
			return newValues;
		}
		const oldKeys = this._itemKeys ??= [];
		const newParts = [];
		let newKeyToIndexMap;
		let oldKeyToIndexMap;
		let oldHead = 0;
		let oldTail = oldParts.length - 1;
		let newHead = 0;
		let newTail = newValues.length - 1;
		while (oldHead <= oldTail && newHead <= newTail) if (oldParts[oldHead] === null) oldHead++;
		else if (oldParts[oldTail] === null) oldTail--;
		else if (oldKeys[oldHead] === newKeys[newHead]) {
			newParts[newHead] = setChildPartValue(oldParts[oldHead], newValues[newHead]);
			oldHead++;
			newHead++;
		} else if (oldKeys[oldTail] === newKeys[newTail]) {
			newParts[newTail] = setChildPartValue(oldParts[oldTail], newValues[newTail]);
			oldTail--;
			newTail--;
		} else if (oldKeys[oldHead] === newKeys[newTail]) {
			newParts[newTail] = setChildPartValue(oldParts[oldHead], newValues[newTail]);
			insertPart(containerPart, newParts[newTail + 1], oldParts[oldHead]);
			oldHead++;
			newTail--;
		} else if (oldKeys[oldTail] === newKeys[newHead]) {
			newParts[newHead] = setChildPartValue(oldParts[oldTail], newValues[newHead]);
			insertPart(containerPart, oldParts[oldHead], oldParts[oldTail]);
			oldTail--;
			newHead++;
		} else {
			if (newKeyToIndexMap === void 0) {
				newKeyToIndexMap = generateMap(newKeys, newHead, newTail);
				oldKeyToIndexMap = generateMap(oldKeys, oldHead, oldTail);
			}
			if (!newKeyToIndexMap.has(oldKeys[oldHead])) {
				removePart(oldParts[oldHead]);
				oldHead++;
			} else if (!newKeyToIndexMap.has(oldKeys[oldTail])) {
				removePart(oldParts[oldTail]);
				oldTail--;
			} else {
				const oldIndex = oldKeyToIndexMap.get(newKeys[newHead]);
				const oldPart = oldIndex !== void 0 ? oldParts[oldIndex] : null;
				if (oldPart === null) {
					const newPart = insertPart(containerPart, oldParts[oldHead]);
					setChildPartValue(newPart, newValues[newHead]);
					newParts[newHead] = newPart;
				} else {
					newParts[newHead] = setChildPartValue(oldPart, newValues[newHead]);
					insertPart(containerPart, oldParts[oldHead], oldPart);
					oldParts[oldIndex] = null;
				}
				newHead++;
			}
		}
		while (newHead <= newTail) {
			const newPart = insertPart(containerPart, newParts[newTail + 1]);
			setChildPartValue(newPart, newValues[newHead]);
			newParts[newHead++] = newPart;
		}
		while (oldHead <= oldTail) {
			const oldPart = oldParts[oldHead++];
			if (oldPart !== null) removePart(oldPart);
		}
		this._itemKeys = newKeys;
		setCommittedValue(containerPart, newParts);
		return noChange;
	}
};
/**
* A directive that repeats a series of values (usually `TemplateResults`)
* generated from an iterable, and updates those items efficiently when the
* iterable changes based on user-provided `keys` associated with each item.
*
* Note that if a `keyFn` is provided, strict key-to-DOM mapping is maintained,
* meaning previous DOM for a given key is moved into the new position if
* needed, and DOM will never be reused with values for different keys (new DOM
* will always be created for new keys). This is generally the most efficient
* way to use `repeat` since it performs minimum unnecessary work for insertions
* and removals.
*
* The `keyFn` takes two parameters, the item and its index, and returns a unique key value.
*
* ```js
* html`
*   <ol>
*     ${repeat(this.items, (item) => item.id, (item, index) => {
*       return html`<li>${index}: ${item.name}</li>`;
*     })}
*   </ol>
* `
* ```
*
* **Important**: If providing a `keyFn`, keys *must* be unique for all items in a
* given call to `repeat`. The behavior when two or more items have the same key
* is undefined.
*
* If no `keyFn` is provided, this directive will perform similar to mapping
* items to values, and DOM will be reused against potentially different items.
*/
var repeat = directive(RepeatDirective);
//#endregion
//#region node_modules/lit-html/development/directives/style-map.js
/**
* @license
* Copyright 2018 Google LLC
* SPDX-License-Identifier: BSD-3-Clause
*/
var important = "important";
var importantFlag = " !important";
var flagTrim = -11;
var StyleMapDirective = class extends Directive {
	constructor(partInfo) {
		super(partInfo);
		if (partInfo.type !== PartType.ATTRIBUTE || partInfo.name !== "style" || partInfo.strings?.length > 2) throw new Error("The `styleMap` directive must be used in the `style` attribute and must be the only part in the attribute.");
	}
	render(styleInfo) {
		return Object.keys(styleInfo).reduce((style, prop) => {
			const value = styleInfo[prop];
			if (value == null) return style;
			prop = prop.includes("-") ? prop : prop.replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g, "-$&").toLowerCase();
			return style + `${prop}:${value};`;
		}, "");
	}
	update(part, [styleInfo]) {
		const { style } = part.element;
		if (this._previousStyleProperties === void 0) {
			this._previousStyleProperties = new Set(Object.keys(styleInfo));
			return this.render(styleInfo);
		}
		for (const name of this._previousStyleProperties) if (styleInfo[name] == null) {
			this._previousStyleProperties.delete(name);
			if (name.includes("-")) style.removeProperty(name);
			else style[name] = null;
		}
		for (const name in styleInfo) {
			const value = styleInfo[name];
			if (value != null) {
				this._previousStyleProperties.add(name);
				const isImportant = typeof value === "string" && value.endsWith(importantFlag);
				if (name.includes("-") || isImportant) style.setProperty(name, isImportant ? value.slice(0, flagTrim) : value, isImportant ? important : "");
				else style[name] = value;
			}
		}
		return noChange;
	}
};
/**
* A directive that applies CSS properties to an element.
*
* `styleMap` can only be used in the `style` attribute and must be the only
* expression in the attribute. It takes the property names in the
* {@link StyleInfo styleInfo} object and adds the properties to the inline
* style of the element.
*
* Property names with dashes (`-`) are assumed to be valid CSS
* property names and set on the element's style object using `setProperty()`.
* Names without dashes are assumed to be camelCased JavaScript property names
* and set on the element's style object using property assignment, allowing the
* style object to translate JavaScript-style names to CSS property names.
*
* For example `styleMap({backgroundColor: 'red', 'border-top': '5px', '--size':
* '0'})` sets the `background-color`, `border-top` and `--size` properties.
*
* @param styleInfo
* @see {@link https://lit.dev/docs/templates/directives/#stylemap styleMap code samples on Lit.dev}
*/
var styleMap = directive(StyleMapDirective);
//#endregion
//#region node_modules/@turf/helpers/dist/esm/index.js
var earthRadius = 6371008.8;
earthRadius * 100, earthRadius * 100, 360 / (2 * Math.PI), earthRadius * 3.28084, earthRadius * 39.37, earthRadius / 1e3, earthRadius / 1e3, earthRadius / 1609.344, earthRadius * 1e3, earthRadius * 1e3, earthRadius / 1852, earthRadius * 1.0936;
function feature(geom, properties, options = {}) {
	const feat = { type: "Feature" };
	if (options.id === 0 || options.id) feat.id = options.id;
	if (options.bbox) feat.bbox = options.bbox;
	feat.properties = properties || {};
	feat.geometry = geom;
	return feat;
}
function polygon(coordinates, properties, options = {}) {
	for (const ring of coordinates) {
		if (ring.length < 4) throw new Error("Each LinearRing of a Polygon must have 4 or more Positions.");
		if (ring[ring.length - 1].length !== ring[0].length) throw new Error("First and last Position are not equivalent.");
		for (let j = 0; j < ring[ring.length - 1].length; j++) if (ring[ring.length - 1][j] !== ring[0][j]) throw new Error("First and last Position are not equivalent.");
	}
	return feature({
		type: "Polygon",
		coordinates
	}, properties, options);
}
function featureCollection(features, options = {}) {
	const fc = { type: "FeatureCollection" };
	if (options.id) fc.id = options.id;
	if (options.bbox) fc.bbox = options.bbox;
	fc.features = features;
	return fc;
}
function multiPolygon(coordinates, properties, options = {}) {
	return feature({
		type: "MultiPolygon",
		coordinates
	}, properties, options);
}
//#endregion
//#region node_modules/bignumber.js/bignumber.mjs
var isNumeric = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i, mathceil = Math.ceil, mathfloor = Math.floor, bignumberError = "[BigNumber Error] ", tooManyDigits = bignumberError + "Number primitive has more than 15 significant digits: ", BASE = 0x5af3107a4000, LOG_BASE = 14, MAX_SAFE_INTEGER = 9007199254740991, POWS_TEN = [
	1,
	10,
	100,
	1e3,
	1e4,
	1e5,
	1e6,
	1e7,
	1e8,
	1e9,
	1e10,
	1e11,
	0xe8d4a51000,
	0x9184e72a000
], SQRT_BASE = 1e7, MAX = 1e9;
function clone(configObject) {
	var div, convertBase, parseNumeric, P = BigNumber.prototype = {
		constructor: BigNumber,
		toString: null,
		valueOf: null
	}, ONE = new BigNumber(1), DECIMAL_PLACES = 20, ROUNDING_MODE = 4, TO_EXP_NEG = -7, TO_EXP_POS = 21, MIN_EXP = -1e7, MAX_EXP = 1e7, CRYPTO = false, MODULO_MODE = 1, POW_PRECISION = 0, FORMAT = {
		prefix: "",
		groupSize: 3,
		secondaryGroupSize: 0,
		groupSeparator: ",",
		decimalSeparator: ".",
		fractionGroupSize: 0,
		fractionGroupSeparator: "\xA0",
		suffix: ""
	}, ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz", alphabetHasNormalDecimalDigits = true;
	function BigNumber(v, b) {
		var alphabet, c, caseChanged, e, i, isNum, len, str, x = this;
		if (!(x instanceof BigNumber)) return new BigNumber(v, b);
		if (b == null) {
			if (v && v._isBigNumber === true) {
				x.s = v.s;
				if (!v.c || v.e > MAX_EXP) x.c = x.e = null;
				else if (v.e < MIN_EXP) x.c = [x.e = 0];
				else {
					x.e = v.e;
					x.c = v.c.slice();
				}
				return;
			}
			if ((isNum = typeof v == "number") && v * 0 == 0) {
				x.s = 1 / v < 0 ? (v = -v, -1) : 1;
				if (v === ~~v) {
					for (e = 0, i = v; i >= 10; i /= 10, e++);
					if (e > MAX_EXP) x.c = x.e = null;
					else {
						x.e = e;
						x.c = [v];
					}
					return;
				}
				str = String(v);
			} else {
				if (!isNumeric.test(str = String(v))) return parseNumeric(x, str, isNum);
				x.s = str.charCodeAt(0) == 45 ? (str = str.slice(1), -1) : 1;
			}
			if ((e = str.indexOf(".")) > -1) str = str.replace(".", "");
			if ((i = str.search(/e/i)) > 0) {
				if (e < 0) e = i;
				e += +str.slice(i + 1);
				str = str.substring(0, i);
			} else if (e < 0) e = str.length;
		} else {
			intCheck(b, 2, ALPHABET.length, "Base");
			if (b == 10 && alphabetHasNormalDecimalDigits) {
				x = new BigNumber(v);
				return round(x, DECIMAL_PLACES + x.e + 1, ROUNDING_MODE);
			}
			str = String(v);
			if (isNum = typeof v == "number") {
				if (v * 0 != 0) return parseNumeric(x, str, isNum, b);
				x.s = 1 / v < 0 ? (str = str.slice(1), -1) : 1;
				if (BigNumber.DEBUG && str.replace(/^0\.0*|\./, "").length > 15) throw Error(tooManyDigits + v);
			} else x.s = str.charCodeAt(0) === 45 ? (str = str.slice(1), -1) : 1;
			alphabet = ALPHABET.slice(0, b);
			e = i = 0;
			for (len = str.length; i < len; i++) if (alphabet.indexOf(c = str.charAt(i)) < 0) {
				if (c == ".") {
					if (i > e) {
						e = len;
						continue;
					}
				} else if (!caseChanged) {
					if (str == str.toUpperCase() && (str = str.toLowerCase()) || str == str.toLowerCase() && (str = str.toUpperCase())) {
						caseChanged = true;
						i = -1;
						e = 0;
						continue;
					}
				}
				return parseNumeric(x, String(v), isNum, b);
			}
			isNum = false;
			str = convertBase(str, b, 10, x.s);
			if ((e = str.indexOf(".")) > -1) str = str.replace(".", "");
			else e = str.length;
		}
		for (i = 0; str.charCodeAt(i) === 48; i++);
		for (len = str.length; str.charCodeAt(--len) === 48;);
		if (str = str.slice(i, ++len)) {
			len -= i;
			if (isNum && BigNumber.DEBUG && len > 15 && (v > MAX_SAFE_INTEGER || v !== mathfloor(v))) throw Error(tooManyDigits + x.s * v);
			if ((e = e - i - 1) > MAX_EXP) x.c = x.e = null;
			else if (e < MIN_EXP) x.c = [x.e = 0];
			else {
				x.e = e;
				x.c = [];
				i = (e + 1) % LOG_BASE;
				if (e < 0) i += LOG_BASE;
				if (i < len) {
					if (i) x.c.push(+str.slice(0, i));
					for (len -= LOG_BASE; i < len;) x.c.push(+str.slice(i, i += LOG_BASE));
					i = LOG_BASE - (str = str.slice(i)).length;
				} else i -= len;
				for (; i--; str += "0");
				x.c.push(+str);
			}
		} else x.c = [x.e = 0];
	}
	BigNumber.clone = clone;
	BigNumber.ROUND_UP = 0;
	BigNumber.ROUND_DOWN = 1;
	BigNumber.ROUND_CEIL = 2;
	BigNumber.ROUND_FLOOR = 3;
	BigNumber.ROUND_HALF_UP = 4;
	BigNumber.ROUND_HALF_DOWN = 5;
	BigNumber.ROUND_HALF_EVEN = 6;
	BigNumber.ROUND_HALF_CEIL = 7;
	BigNumber.ROUND_HALF_FLOOR = 8;
	BigNumber.EUCLID = 9;
	BigNumber.config = BigNumber.set = function(obj) {
		var p, v;
		if (obj != null) if (typeof obj == "object") {
			if (obj.hasOwnProperty(p = "DECIMAL_PLACES")) {
				v = obj[p];
				intCheck(v, 0, MAX, p);
				DECIMAL_PLACES = v;
			}
			if (obj.hasOwnProperty(p = "ROUNDING_MODE")) {
				v = obj[p];
				intCheck(v, 0, 8, p);
				ROUNDING_MODE = v;
			}
			if (obj.hasOwnProperty(p = "EXPONENTIAL_AT")) {
				v = obj[p];
				if (v && v.pop) {
					intCheck(v[0], -MAX, 0, p);
					intCheck(v[1], 0, MAX, p);
					TO_EXP_NEG = v[0];
					TO_EXP_POS = v[1];
				} else {
					intCheck(v, -MAX, MAX, p);
					TO_EXP_NEG = -(TO_EXP_POS = v < 0 ? -v : v);
				}
			}
			if (obj.hasOwnProperty(p = "RANGE")) {
				v = obj[p];
				if (v && v.pop) {
					intCheck(v[0], -MAX, -1, p);
					intCheck(v[1], 1, MAX, p);
					MIN_EXP = v[0];
					MAX_EXP = v[1];
				} else {
					intCheck(v, -MAX, MAX, p);
					if (v) MIN_EXP = -(MAX_EXP = v < 0 ? -v : v);
					else throw Error(bignumberError + p + " cannot be zero: " + v);
				}
			}
			if (obj.hasOwnProperty(p = "CRYPTO")) {
				v = obj[p];
				if (v === !!v) if (v) if (typeof crypto != "undefined" && crypto && (crypto.getRandomValues || crypto.randomBytes)) CRYPTO = v;
				else {
					CRYPTO = !v;
					throw Error(bignumberError + "crypto unavailable");
				}
				else CRYPTO = v;
				else throw Error(bignumberError + p + " not true or false: " + v);
			}
			if (obj.hasOwnProperty(p = "MODULO_MODE")) {
				v = obj[p];
				intCheck(v, 0, 9, p);
				MODULO_MODE = v;
			}
			if (obj.hasOwnProperty(p = "POW_PRECISION")) {
				v = obj[p];
				intCheck(v, 0, MAX, p);
				POW_PRECISION = v;
			}
			if (obj.hasOwnProperty(p = "FORMAT")) {
				v = obj[p];
				if (typeof v == "object") FORMAT = v;
				else throw Error(bignumberError + p + " not an object: " + v);
			}
			if (obj.hasOwnProperty(p = "ALPHABET")) {
				v = obj[p];
				if (typeof v == "string" && !/^.?$|[+\-.\s]|(.).*\1/.test(v)) {
					alphabetHasNormalDecimalDigits = v.slice(0, 10) == "0123456789";
					ALPHABET = v;
				} else throw Error(bignumberError + p + " invalid: " + v);
			}
		} else throw Error(bignumberError + "Object expected: " + obj);
		return {
			DECIMAL_PLACES,
			ROUNDING_MODE,
			EXPONENTIAL_AT: [TO_EXP_NEG, TO_EXP_POS],
			RANGE: [MIN_EXP, MAX_EXP],
			CRYPTO,
			MODULO_MODE,
			POW_PRECISION,
			FORMAT,
			ALPHABET
		};
	};
	BigNumber.isBigNumber = function(v) {
		if (!v || v._isBigNumber !== true) return false;
		if (!BigNumber.DEBUG) return true;
		var i, n, c = v.c, e = v.e, s = v.s;
		out: if ({}.toString.call(c) == "[object Array]") {
			if ((s === 1 || s === -1) && e >= -MAX && e <= MAX && e === mathfloor(e)) {
				if (c[0] === 0) {
					if (e === 0 && c.length === 1) return true;
					break out;
				}
				i = (e + 1) % LOG_BASE;
				if (i < 1) i += LOG_BASE;
				if (String(c[0]).length == i) {
					for (i = 0; i < c.length; i++) {
						n = c[i];
						if (n < 0 || n >= BASE || n !== mathfloor(n)) break out;
					}
					if (n !== 0) return true;
				}
			}
		} else if (c === null && e === null && (s === null || s === 1 || s === -1)) return true;
		throw Error(bignumberError + "Invalid BigNumber: " + v);
	};
	BigNumber.maximum = BigNumber.max = function() {
		return maxOrMin(arguments, -1);
	};
	BigNumber.minimum = BigNumber.min = function() {
		return maxOrMin(arguments, 1);
	};
	BigNumber.random = (function() {
		var pow2_53 = 9007199254740992;
		var random53bitInt = Math.random() * pow2_53 & 2097151 ? function() {
			return mathfloor(Math.random() * pow2_53);
		} : function() {
			return (Math.random() * 1073741824 | 0) * 8388608 + (Math.random() * 8388608 | 0);
		};
		return function(dp) {
			var a, b, e, k, v, i = 0, c = [], rand = new BigNumber(ONE);
			if (dp == null) dp = DECIMAL_PLACES;
			else intCheck(dp, 0, MAX);
			k = mathceil(dp / LOG_BASE);
			if (CRYPTO) if (crypto.getRandomValues) {
				a = crypto.getRandomValues(new Uint32Array(k *= 2));
				for (; i < k;) {
					v = a[i] * 131072 + (a[i + 1] >>> 11);
					if (v >= 9e15) {
						b = crypto.getRandomValues(new Uint32Array(2));
						a[i] = b[0];
						a[i + 1] = b[1];
					} else {
						c.push(v % 0x5af3107a4000);
						i += 2;
					}
				}
				i = k / 2;
			} else if (crypto.randomBytes) {
				a = crypto.randomBytes(k *= 7);
				for (; i < k;) {
					v = (a[i] & 31) * 281474976710656 + a[i + 1] * 1099511627776 + a[i + 2] * 4294967296 + a[i + 3] * 16777216 + (a[i + 4] << 16) + (a[i + 5] << 8) + a[i + 6];
					if (v >= 9e15) crypto.randomBytes(7).copy(a, i);
					else {
						c.push(v % 0x5af3107a4000);
						i += 7;
					}
				}
				i = k / 7;
			} else {
				CRYPTO = false;
				throw Error(bignumberError + "crypto unavailable");
			}
			if (!CRYPTO) for (; i < k;) {
				v = random53bitInt();
				if (v < 9e15) c[i++] = v % 0x5af3107a4000;
			}
			k = c[--i];
			dp %= LOG_BASE;
			if (k && dp) {
				v = POWS_TEN[LOG_BASE - dp];
				c[i] = mathfloor(k / v) * v;
			}
			for (; c[i] === 0; c.pop(), i--);
			if (i < 0) c = [e = 0];
			else {
				for (e = -1; c[0] === 0; c.splice(0, 1), e -= LOG_BASE);
				for (i = 1, v = c[0]; v >= 10; v /= 10, i++);
				if (i < LOG_BASE) e -= LOG_BASE - i;
			}
			rand.e = e;
			rand.c = c;
			return rand;
		};
	})();
	BigNumber.sum = function() {
		var i = 1, args = arguments, sum = new BigNumber(args[0]);
		for (; i < args.length;) sum = sum.plus(args[i++]);
		return sum;
	};
	convertBase = (function() {
		var decimal = "0123456789";
		function toBaseOut(str, baseIn, baseOut, alphabet) {
			var j, arr = [0], arrL, i = 0, len = str.length;
			for (; i < len;) {
				for (arrL = arr.length; arrL--; arr[arrL] *= baseIn);
				arr[0] += alphabet.indexOf(str.charAt(i++));
				for (j = 0; j < arr.length; j++) if (arr[j] > baseOut - 1) {
					if (arr[j + 1] == null) arr[j + 1] = 0;
					arr[j + 1] += arr[j] / baseOut | 0;
					arr[j] %= baseOut;
				}
			}
			return arr.reverse();
		}
		return function(str, baseIn, baseOut, sign, callerIsToString) {
			var alphabet, d, e, k, r, x, xc, y, i = str.indexOf("."), dp = DECIMAL_PLACES, rm = ROUNDING_MODE;
			if (i >= 0) {
				k = POW_PRECISION;
				POW_PRECISION = 0;
				str = str.replace(".", "");
				y = new BigNumber(baseIn);
				x = y.pow(str.length - i);
				POW_PRECISION = k;
				y.c = toBaseOut(toFixedPoint(coeffToString(x.c), x.e, "0"), 10, baseOut, decimal);
				y.e = y.c.length;
			}
			xc = toBaseOut(str, baseIn, baseOut, callerIsToString ? (alphabet = ALPHABET, decimal) : (alphabet = decimal, ALPHABET));
			e = k = xc.length;
			for (; xc[--k] == 0; xc.pop());
			if (!xc[0]) return alphabet.charAt(0);
			if (i < 0) --e;
			else {
				x.c = xc;
				x.e = e;
				x.s = sign;
				x = div(x, y, dp, rm, baseOut);
				xc = x.c;
				r = x.r;
				e = x.e;
			}
			d = e + dp + 1;
			i = xc[d];
			k = baseOut / 2;
			r = r || d < 0 || xc[d + 1] != null;
			r = rm < 4 ? (i != null || r) && (rm == 0 || rm == (x.s < 0 ? 3 : 2)) : i > k || i == k && (rm == 4 || r || rm == 6 && xc[d - 1] & 1 || rm == (x.s < 0 ? 8 : 7));
			if (d < 1 || !xc[0]) str = r ? toFixedPoint(alphabet.charAt(1), -dp, alphabet.charAt(0)) : alphabet.charAt(0);
			else {
				xc.length = d;
				if (r) for (--baseOut; ++xc[--d] > baseOut;) {
					xc[d] = 0;
					if (!d) {
						++e;
						xc = [1].concat(xc);
					}
				}
				for (k = xc.length; !xc[--k];);
				for (i = 0, str = ""; i <= k; str += alphabet.charAt(xc[i++]));
				str = toFixedPoint(str, e, alphabet.charAt(0));
			}
			return str;
		};
	})();
	div = (function() {
		function multiply(x, k, base) {
			var m, temp, xlo, xhi, carry = 0, i = x.length, klo = k % SQRT_BASE, khi = k / SQRT_BASE | 0;
			for (x = x.slice(); i--;) {
				xlo = x[i] % SQRT_BASE;
				xhi = x[i] / SQRT_BASE | 0;
				m = khi * xlo + xhi * klo;
				temp = klo * xlo + m % SQRT_BASE * SQRT_BASE + carry;
				carry = (temp / base | 0) + (m / SQRT_BASE | 0) + khi * xhi;
				x[i] = temp % base;
			}
			if (carry) x = [carry].concat(x);
			return x;
		}
		function compare(a, b, aL, bL) {
			var i, cmp;
			if (aL != bL) cmp = aL > bL ? 1 : -1;
			else for (i = cmp = 0; i < aL; i++) if (a[i] != b[i]) {
				cmp = a[i] > b[i] ? 1 : -1;
				break;
			}
			return cmp;
		}
		function subtract(a, b, aL, base) {
			var i = 0;
			for (; aL--;) {
				a[aL] -= i;
				i = a[aL] < b[aL] ? 1 : 0;
				a[aL] = i * base + a[aL] - b[aL];
			}
			for (; !a[0] && a.length > 1; a.splice(0, 1));
		}
		return function(x, y, dp, rm, base) {
			var cmp, e, i, more, n, prod, prodL, q, qc, rem, remL, rem0, xi, xL, yc0, yL, yz, s = x.s == y.s ? 1 : -1, xc = x.c, yc = y.c;
			if (!xc || !xc[0] || !yc || !yc[0]) return new BigNumber(!x.s || !y.s || (xc ? yc && xc[0] == yc[0] : !yc) ? NaN : xc && xc[0] == 0 || !yc ? s * 0 : s / 0);
			q = new BigNumber(s);
			qc = q.c = [];
			e = x.e - y.e;
			s = dp + e + 1;
			if (!base) {
				base = BASE;
				e = bitFloor(x.e / LOG_BASE) - bitFloor(y.e / LOG_BASE);
				s = s / LOG_BASE | 0;
			}
			for (i = 0; yc[i] == (xc[i] || 0); i++);
			if (yc[i] > (xc[i] || 0)) e--;
			if (s < 0) {
				qc.push(1);
				more = true;
			} else {
				xL = xc.length;
				yL = yc.length;
				i = 0;
				s += 2;
				n = mathfloor(base / (yc[0] + 1));
				if (n > 1) {
					yc = multiply(yc, n, base);
					xc = multiply(xc, n, base);
					yL = yc.length;
					xL = xc.length;
				}
				xi = yL;
				rem = xc.slice(0, yL);
				remL = rem.length;
				for (; remL < yL; rem[remL++] = 0);
				yz = yc.slice();
				yz = [0].concat(yz);
				yc0 = yc[0];
				if (yc[1] >= base / 2) yc0++;
				do {
					n = 0;
					cmp = compare(yc, rem, yL, remL);
					if (cmp < 0) {
						rem0 = rem[0];
						if (yL != remL) rem0 = rem0 * base + (rem[1] || 0);
						n = mathfloor(rem0 / yc0);
						if (n > 1) {
							if (n >= base) n = base - 1;
							prod = multiply(yc, n, base);
							prodL = prod.length;
							remL = rem.length;
							while (compare(prod, rem, prodL, remL) == 1) {
								n--;
								subtract(prod, yL < prodL ? yz : yc, prodL, base);
								prodL = prod.length;
								cmp = 1;
							}
						} else {
							if (n == 0) cmp = n = 1;
							prod = yc.slice();
							prodL = prod.length;
						}
						if (prodL < remL) prod = [0].concat(prod);
						subtract(rem, prod, remL, base);
						remL = rem.length;
						if (cmp == -1) while (compare(yc, rem, yL, remL) < 1) {
							n++;
							subtract(rem, yL < remL ? yz : yc, remL, base);
							remL = rem.length;
						}
					} else if (cmp === 0) {
						n++;
						rem = [0];
					}
					qc[i++] = n;
					if (rem[0]) rem[remL++] = xc[xi] || 0;
					else {
						rem = [xc[xi]];
						remL = 1;
					}
				} while ((xi++ < xL || rem[0] != null) && s--);
				more = rem[0] != null;
				if (!qc[0]) qc.splice(0, 1);
			}
			if (base == BASE) {
				for (i = 1, s = qc[0]; s >= 10; s /= 10, i++);
				round(q, dp + (q.e = i + e * LOG_BASE - 1) + 1, rm, more);
			} else {
				q.e = e;
				q.r = +more;
			}
			return q;
		};
	})();
	function format(n, i, rm, id) {
		var c0, e, ne, len, str;
		if (rm == null) rm = ROUNDING_MODE;
		else intCheck(rm, 0, 8);
		if (!n.c) return n.toString();
		c0 = n.c[0];
		ne = n.e;
		if (i == null) {
			str = coeffToString(n.c);
			str = id == 1 || id == 2 && (ne <= TO_EXP_NEG || ne >= TO_EXP_POS) ? toExponential(str, ne) : toFixedPoint(str, ne, "0");
		} else {
			n = round(new BigNumber(n), i, rm);
			e = n.e;
			str = coeffToString(n.c);
			len = str.length;
			if (id == 1 || id == 2 && (i <= e || e <= TO_EXP_NEG)) {
				for (; len < i; str += "0", len++);
				str = toExponential(str, e);
			} else {
				i -= ne + (id === 2 && e > ne);
				str = toFixedPoint(str, e, "0");
				if (e + 1 > len) {
					if (--i > 0) for (str += "."; i--; str += "0");
				} else {
					i += e - len;
					if (i > 0) {
						if (e + 1 == len) str += ".";
						for (; i--; str += "0");
					}
				}
			}
		}
		return n.s < 0 && c0 ? "-" + str : str;
	}
	function maxOrMin(args, n) {
		var k, y, i = 1, x = new BigNumber(args[0]);
		for (; i < args.length; i++) {
			y = new BigNumber(args[i]);
			if (!y.s || (k = compare(x, y)) === n || k === 0 && x.s === n) x = y;
		}
		return x;
	}
	function normalise(n, c, e) {
		var i = 1, j = c.length;
		for (; !c[--j]; c.pop());
		for (j = c[0]; j >= 10; j /= 10, i++);
		if ((e = i + e * LOG_BASE - 1) > MAX_EXP) n.c = n.e = null;
		else if (e < MIN_EXP) n.c = [n.e = 0];
		else {
			n.e = e;
			n.c = c;
		}
		return n;
	}
	parseNumeric = (function() {
		var basePrefix = /^(-?)0([xbo])(?=\w[\w.]*$)/i, dotAfter = /^([^.]+)\.$/, dotBefore = /^\.([^.]+)$/, isInfinityOrNaN = /^-?(Infinity|NaN)$/, whitespaceOrPlus = /^\s*\+(?=[\w.])|^\s+|\s+$/g;
		return function(x, str, isNum, b) {
			var base, s = isNum ? str : str.replace(whitespaceOrPlus, "");
			if (isInfinityOrNaN.test(s)) x.s = isNaN(s) ? null : s < 0 ? -1 : 1;
			else {
				if (!isNum) {
					s = s.replace(basePrefix, function(m, p1, p2) {
						base = (p2 = p2.toLowerCase()) == "x" ? 16 : p2 == "b" ? 2 : 8;
						return !b || b == base ? p1 : m;
					});
					if (b) {
						base = b;
						s = s.replace(dotAfter, "$1").replace(dotBefore, "0.$1");
					}
					if (str != s) return new BigNumber(s, base);
				}
				if (BigNumber.DEBUG) throw Error(bignumberError + "Not a" + (b ? " base " + b : "") + " number: " + str);
				x.s = null;
			}
			x.c = x.e = null;
		};
	})();
	function round(x, sd, rm, r) {
		var d, i, j, k, n, ni, rd, xc = x.c, pows10 = POWS_TEN;
		if (xc) {
			out: {
				for (d = 1, k = xc[0]; k >= 10; k /= 10, d++);
				i = sd - d;
				if (i < 0) {
					i += LOG_BASE;
					j = sd;
					n = xc[ni = 0];
					rd = mathfloor(n / pows10[d - j - 1] % 10);
				} else {
					ni = mathceil((i + 1) / LOG_BASE);
					if (ni >= xc.length) if (r) {
						for (; xc.length <= ni; xc.push(0));
						n = rd = 0;
						d = 1;
						i %= LOG_BASE;
						j = i - LOG_BASE + 1;
					} else break out;
					else {
						n = k = xc[ni];
						for (d = 1; k >= 10; k /= 10, d++);
						i %= LOG_BASE;
						j = i - LOG_BASE + d;
						rd = j < 0 ? 0 : mathfloor(n / pows10[d - j - 1] % 10);
					}
				}
				r = r || sd < 0 || xc[ni + 1] != null || (j < 0 ? n : n % pows10[d - j - 1]);
				r = rm < 4 ? (rd || r) && (rm == 0 || rm == (x.s < 0 ? 3 : 2)) : rd > 5 || rd == 5 && (rm == 4 || r || rm == 6 && (i > 0 ? j > 0 ? n / pows10[d - j] : 0 : xc[ni - 1]) % 10 & 1 || rm == (x.s < 0 ? 8 : 7));
				if (sd < 1 || !xc[0]) {
					xc.length = 0;
					if (r) {
						sd -= x.e + 1;
						xc[0] = pows10[(LOG_BASE - sd % LOG_BASE) % LOG_BASE];
						x.e = -sd || 0;
					} else xc[0] = x.e = 0;
					return x;
				}
				if (i == 0) {
					xc.length = ni;
					k = 1;
					ni--;
				} else {
					xc.length = ni + 1;
					k = pows10[LOG_BASE - i];
					xc[ni] = j > 0 ? mathfloor(n / pows10[d - j] % pows10[j]) * k : 0;
				}
				if (r) for (;;) if (ni == 0) {
					for (i = 1, j = xc[0]; j >= 10; j /= 10, i++);
					j = xc[0] += k;
					for (k = 1; j >= 10; j /= 10, k++);
					if (i != k) {
						x.e++;
						if (xc[0] == BASE) xc[0] = 1;
					}
					break;
				} else {
					xc[ni] += k;
					if (xc[ni] != BASE) break;
					xc[ni--] = 0;
					k = 1;
				}
				for (i = xc.length; xc[--i] === 0; xc.pop());
			}
			if (x.e > MAX_EXP) x.c = x.e = null;
			else if (x.e < MIN_EXP) x.c = [x.e = 0];
		}
		return x;
	}
	function valueOf(n) {
		var str, e = n.e;
		if (e === null) return n.toString();
		str = coeffToString(n.c);
		str = e <= TO_EXP_NEG || e >= TO_EXP_POS ? toExponential(str, e) : toFixedPoint(str, e, "0");
		return n.s < 0 ? "-" + str : str;
	}
	P.absoluteValue = P.abs = function() {
		var x = new BigNumber(this);
		if (x.s < 0) x.s = 1;
		return x;
	};
	P.comparedTo = function(y, b) {
		return compare(this, new BigNumber(y, b));
	};
	P.decimalPlaces = P.dp = function(dp, rm) {
		var c, n, v, x = this;
		if (dp != null) {
			intCheck(dp, 0, MAX);
			if (rm == null) rm = ROUNDING_MODE;
			else intCheck(rm, 0, 8);
			return round(new BigNumber(x), dp + x.e + 1, rm);
		}
		if (!(c = x.c)) return null;
		n = ((v = c.length - 1) - bitFloor(this.e / LOG_BASE)) * LOG_BASE;
		if (v = c[v]) for (; v % 10 == 0; v /= 10, n--);
		if (n < 0) n = 0;
		return n;
	};
	P.dividedBy = P.div = function(y, b) {
		return div(this, new BigNumber(y, b), DECIMAL_PLACES, ROUNDING_MODE);
	};
	P.dividedToIntegerBy = P.idiv = function(y, b) {
		return div(this, new BigNumber(y, b), 0, 1);
	};
	P.exponentiatedBy = P.pow = function(n, m) {
		var half, isModExp, i, k, more, nIsBig, nIsNeg, nIsOdd, y, x = this;
		n = new BigNumber(n);
		if (n.c && !n.isInteger()) throw Error(bignumberError + "Exponent not an integer: " + valueOf(n));
		if (m != null) m = new BigNumber(m);
		nIsBig = n.e > 14;
		if (!x.c || !x.c[0] || x.c[0] == 1 && !x.e && x.c.length == 1 || !n.c || !n.c[0]) {
			y = new BigNumber(Math.pow(+valueOf(x), nIsBig ? n.s * (2 - isOdd(n)) : +valueOf(n)));
			return m ? y.mod(m) : y;
		}
		nIsNeg = n.s < 0;
		if (m) {
			if (m.c ? !m.c[0] : !m.s) return new BigNumber(NaN);
			isModExp = !nIsNeg && x.isInteger() && m.isInteger();
			if (isModExp) x = x.mod(m);
		} else if (n.e > 9 && (x.e > 0 || x.e < -1 || (x.e == 0 ? x.c[0] > 1 || nIsBig && x.c[1] >= 24e7 : x.c[0] < 8e13 || nIsBig && x.c[0] <= 9999975e7))) {
			k = x.s < 0 && isOdd(n) ? -0 : 0;
			if (x.e > -1) k = 1 / k;
			return new BigNumber(nIsNeg ? 1 / k : k);
		} else if (POW_PRECISION) k = mathceil(POW_PRECISION / LOG_BASE + 2);
		if (nIsBig) {
			half = new BigNumber(.5);
			if (nIsNeg) n.s = 1;
			nIsOdd = isOdd(n);
		} else {
			i = Math.abs(+valueOf(n));
			nIsOdd = i % 2;
		}
		y = new BigNumber(ONE);
		for (;;) {
			if (nIsOdd) {
				y = y.times(x);
				if (!y.c) break;
				if (k) {
					if (y.c.length > k) y.c.length = k;
				} else if (isModExp) y = y.mod(m);
			}
			if (i) {
				i = mathfloor(i / 2);
				if (i === 0) break;
				nIsOdd = i % 2;
			} else {
				n = n.times(half);
				round(n, n.e + 1, 1);
				if (n.e > 14) nIsOdd = isOdd(n);
				else {
					i = +valueOf(n);
					if (i === 0) break;
					nIsOdd = i % 2;
				}
			}
			x = x.times(x);
			if (k) {
				if (x.c && x.c.length > k) x.c.length = k;
			} else if (isModExp) x = x.mod(m);
		}
		if (isModExp) return y;
		if (nIsNeg) y = ONE.div(y);
		return m ? y.mod(m) : k ? round(y, POW_PRECISION, ROUNDING_MODE, more) : y;
	};
	P.integerValue = function(rm) {
		var n = new BigNumber(this);
		if (rm == null) rm = ROUNDING_MODE;
		else intCheck(rm, 0, 8);
		return round(n, n.e + 1, rm);
	};
	P.isEqualTo = P.eq = function(y, b) {
		return compare(this, new BigNumber(y, b)) === 0;
	};
	P.isFinite = function() {
		return !!this.c;
	};
	P.isGreaterThan = P.gt = function(y, b) {
		return compare(this, new BigNumber(y, b)) > 0;
	};
	P.isGreaterThanOrEqualTo = P.gte = function(y, b) {
		return (b = compare(this, new BigNumber(y, b))) === 1 || b === 0;
	};
	P.isInteger = function() {
		return !!this.c && bitFloor(this.e / LOG_BASE) > this.c.length - 2;
	};
	P.isLessThan = P.lt = function(y, b) {
		return compare(this, new BigNumber(y, b)) < 0;
	};
	P.isLessThanOrEqualTo = P.lte = function(y, b) {
		return (b = compare(this, new BigNumber(y, b))) === -1 || b === 0;
	};
	P.isNaN = function() {
		return !this.s;
	};
	P.isNegative = function() {
		return this.s < 0;
	};
	P.isPositive = function() {
		return this.s > 0;
	};
	P.isZero = function() {
		return !!this.c && this.c[0] == 0;
	};
	P.minus = function(y, b) {
		var i, j, t, xLTy, x = this, a = x.s;
		y = new BigNumber(y, b);
		b = y.s;
		if (!a || !b) return new BigNumber(NaN);
		if (a != b) {
			y.s = -b;
			return x.plus(y);
		}
		var xe = x.e / LOG_BASE, ye = y.e / LOG_BASE, xc = x.c, yc = y.c;
		if (!xe || !ye) {
			if (!xc || !yc) return xc ? (y.s = -b, y) : new BigNumber(yc ? x : NaN);
			if (!xc[0] || !yc[0]) return yc[0] ? (y.s = -b, y) : new BigNumber(xc[0] ? x : ROUNDING_MODE == 3 ? -0 : 0);
		}
		xe = bitFloor(xe);
		ye = bitFloor(ye);
		xc = xc.slice();
		if (a = xe - ye) {
			if (xLTy = a < 0) {
				a = -a;
				t = xc;
			} else {
				ye = xe;
				t = yc;
			}
			t.reverse();
			for (b = a; b--; t.push(0));
			t.reverse();
		} else {
			j = (xLTy = (a = xc.length) < (b = yc.length)) ? a : b;
			for (a = b = 0; b < j; b++) if (xc[b] != yc[b]) {
				xLTy = xc[b] < yc[b];
				break;
			}
		}
		if (xLTy) {
			t = xc;
			xc = yc;
			yc = t;
			y.s = -y.s;
		}
		b = (j = yc.length) - (i = xc.length);
		if (b > 0) for (; b--; xc[i++] = 0);
		b = BASE - 1;
		for (; j > a;) {
			if (xc[--j] < yc[j]) {
				for (i = j; i && !xc[--i]; xc[i] = b);
				--xc[i];
				xc[j] += BASE;
			}
			xc[j] -= yc[j];
		}
		for (; xc[0] == 0; xc.splice(0, 1), --ye);
		if (!xc[0]) {
			y.s = ROUNDING_MODE == 3 ? -1 : 1;
			y.c = [y.e = 0];
			return y;
		}
		return normalise(y, xc, ye);
	};
	P.modulo = P.mod = function(y, b) {
		var q, s, x = this;
		y = new BigNumber(y, b);
		if (!x.c || !y.s || y.c && !y.c[0]) return new BigNumber(NaN);
		else if (!y.c || x.c && !x.c[0]) return new BigNumber(x);
		if (MODULO_MODE == 9) {
			s = y.s;
			y.s = 1;
			q = div(x, y, 0, 3);
			y.s = s;
			q.s *= s;
		} else q = div(x, y, 0, MODULO_MODE);
		y = x.minus(q.times(y));
		if (!y.c[0] && MODULO_MODE == 1) y.s = x.s;
		return y;
	};
	P.multipliedBy = P.times = function(y, b) {
		var c, e, i, j, k, m, xcL, xlo, xhi, ycL, ylo, yhi, zc, base, sqrtBase, x = this, xc = x.c, yc = (y = new BigNumber(y, b)).c;
		if (!xc || !yc || !xc[0] || !yc[0]) {
			if (!x.s || !y.s || xc && !xc[0] && !yc || yc && !yc[0] && !xc) y.c = y.e = y.s = null;
			else {
				y.s *= x.s;
				if (!xc || !yc) y.c = y.e = null;
				else {
					y.c = [0];
					y.e = 0;
				}
			}
			return y;
		}
		e = bitFloor(x.e / LOG_BASE) + bitFloor(y.e / LOG_BASE);
		y.s *= x.s;
		xcL = xc.length;
		ycL = yc.length;
		if (xcL < ycL) {
			zc = xc;
			xc = yc;
			yc = zc;
			i = xcL;
			xcL = ycL;
			ycL = i;
		}
		for (i = xcL + ycL, zc = []; i--; zc.push(0));
		base = BASE;
		sqrtBase = SQRT_BASE;
		for (i = ycL; --i >= 0;) {
			c = 0;
			ylo = yc[i] % sqrtBase;
			yhi = yc[i] / sqrtBase | 0;
			for (k = xcL, j = i + k; j > i;) {
				xlo = xc[--k] % sqrtBase;
				xhi = xc[k] / sqrtBase | 0;
				m = yhi * xlo + xhi * ylo;
				xlo = ylo * xlo + m % sqrtBase * sqrtBase + zc[j] + c;
				c = (xlo / base | 0) + (m / sqrtBase | 0) + yhi * xhi;
				zc[j--] = xlo % base;
			}
			zc[j] = c;
		}
		if (c) ++e;
		else zc.splice(0, 1);
		return normalise(y, zc, e);
	};
	P.negated = function() {
		var x = new BigNumber(this);
		x.s = -x.s || null;
		return x;
	};
	P.plus = function(y, b) {
		var t, x = this, a = x.s;
		y = new BigNumber(y, b);
		b = y.s;
		if (!a || !b) return new BigNumber(NaN);
		if (a != b) {
			y.s = -b;
			return x.minus(y);
		}
		var xe = x.e / LOG_BASE, ye = y.e / LOG_BASE, xc = x.c, yc = y.c;
		if (!xe || !ye) {
			if (!xc || !yc) return new BigNumber(a / 0);
			if (!xc[0] || !yc[0]) return yc[0] ? y : new BigNumber(xc[0] ? x : a * 0);
		}
		xe = bitFloor(xe);
		ye = bitFloor(ye);
		xc = xc.slice();
		if (a = xe - ye) {
			if (a > 0) {
				ye = xe;
				t = yc;
			} else {
				a = -a;
				t = xc;
			}
			t.reverse();
			for (; a--; t.push(0));
			t.reverse();
		}
		a = xc.length;
		b = yc.length;
		if (a - b < 0) {
			t = yc;
			yc = xc;
			xc = t;
			b = a;
		}
		for (a = 0; b;) {
			a = (xc[--b] = xc[b] + yc[b] + a) / BASE | 0;
			xc[b] = BASE === xc[b] ? 0 : xc[b] % BASE;
		}
		if (a) {
			xc = [a].concat(xc);
			++ye;
		}
		return normalise(y, xc, ye);
	};
	P.precision = P.sd = function(sd, rm) {
		var c, n, v, x = this;
		if (sd != null && sd !== !!sd) {
			intCheck(sd, 1, MAX);
			if (rm == null) rm = ROUNDING_MODE;
			else intCheck(rm, 0, 8);
			return round(new BigNumber(x), sd, rm);
		}
		if (!(c = x.c)) return null;
		v = c.length - 1;
		n = v * LOG_BASE + 1;
		if (v = c[v]) {
			for (; v % 10 == 0; v /= 10, n--);
			for (v = c[0]; v >= 10; v /= 10, n++);
		}
		if (sd && x.e + 1 > n) n = x.e + 1;
		return n;
	};
	P.shiftedBy = function(k) {
		intCheck(k, -MAX_SAFE_INTEGER, MAX_SAFE_INTEGER);
		return this.times("1e" + k);
	};
	P.squareRoot = P.sqrt = function() {
		var m, n, r, rep, t, x = this, c = x.c, s = x.s, e = x.e, dp = DECIMAL_PLACES + 4, half = new BigNumber("0.5");
		if (s !== 1 || !c || !c[0]) return new BigNumber(!s || s < 0 && (!c || c[0]) ? NaN : c ? x : Infinity);
		s = Math.sqrt(+valueOf(x));
		if (s == 0 || s == Infinity) {
			n = coeffToString(c);
			if ((n.length + e) % 2 == 0) n += "0";
			s = Math.sqrt(+n);
			e = bitFloor((e + 1) / 2) - (e < 0 || e % 2);
			if (s == Infinity) n = "5e" + e;
			else {
				n = s.toExponential();
				n = n.slice(0, n.indexOf("e") + 1) + e;
			}
			r = new BigNumber(n);
		} else r = new BigNumber(s + "");
		if (r.c[0]) {
			e = r.e;
			s = e + dp;
			if (s < 3) s = 0;
			for (;;) {
				t = r;
				r = half.times(t.plus(div(x, t, dp, 1)));
				if (coeffToString(t.c).slice(0, s) === (n = coeffToString(r.c)).slice(0, s)) {
					if (r.e < e) --s;
					n = n.slice(s - 3, s + 1);
					if (n == "9999" || !rep && n == "4999") {
						if (!rep) {
							round(t, t.e + DECIMAL_PLACES + 2, 0);
							if (t.times(t).eq(x)) {
								r = t;
								break;
							}
						}
						dp += 4;
						s += 4;
						rep = 1;
					} else {
						if (!+n || !+n.slice(1) && n.charAt(0) == "5") {
							round(r, r.e + DECIMAL_PLACES + 2, 1);
							m = !r.times(r).eq(x);
						}
						break;
					}
				}
			}
		}
		return round(r, r.e + DECIMAL_PLACES + 1, ROUNDING_MODE, m);
	};
	P.toExponential = function(dp, rm) {
		if (dp != null) {
			intCheck(dp, 0, MAX);
			dp++;
		}
		return format(this, dp, rm, 1);
	};
	P.toFixed = function(dp, rm) {
		if (dp != null) {
			intCheck(dp, 0, MAX);
			dp = dp + this.e + 1;
		}
		return format(this, dp, rm);
	};
	P.toFormat = function(dp, rm, format) {
		var str, x = this;
		if (format == null) if (dp != null && rm && typeof rm == "object") {
			format = rm;
			rm = null;
		} else if (dp && typeof dp == "object") {
			format = dp;
			dp = rm = null;
		} else format = FORMAT;
		else if (typeof format != "object") throw Error(bignumberError + "Argument not an object: " + format);
		str = x.toFixed(dp, rm);
		if (x.c) {
			var i, arr = str.split("."), g1 = +format.groupSize, g2 = +format.secondaryGroupSize, groupSeparator = format.groupSeparator || "", intPart = arr[0], fractionPart = arr[1], isNeg = x.s < 0, intDigits = isNeg ? intPart.slice(1) : intPart, len = intDigits.length;
			if (g2) {
				i = g1;
				g1 = g2;
				g2 = i;
				len -= i;
			}
			if (g1 > 0 && len > 0) {
				i = len % g1 || g1;
				intPart = intDigits.substr(0, i);
				for (; i < len; i += g1) intPart += groupSeparator + intDigits.substr(i, g1);
				if (g2 > 0) intPart += groupSeparator + intDigits.slice(i);
				if (isNeg) intPart = "-" + intPart;
			}
			str = fractionPart ? intPart + (format.decimalSeparator || "") + ((g2 = +format.fractionGroupSize) ? fractionPart.replace(new RegExp("\\d{" + g2 + "}\\B", "g"), "$&" + (format.fractionGroupSeparator || "")) : fractionPart) : intPart;
		}
		return (format.prefix || "") + str + (format.suffix || "");
	};
	P.toFraction = function(md) {
		var d, d0, d1, d2, e, exp, n, n0, n1, q, r, s, x = this, xc = x.c;
		if (md != null) {
			n = new BigNumber(md);
			if (!n.isInteger() && (n.c || n.s !== 1) || n.lt(ONE)) throw Error(bignumberError + "Argument " + (n.isInteger() ? "out of range: " : "not an integer: ") + valueOf(n));
		}
		if (!xc) return new BigNumber(x);
		d = new BigNumber(ONE);
		n1 = d0 = new BigNumber(ONE);
		d1 = n0 = new BigNumber(ONE);
		s = coeffToString(xc);
		e = d.e = s.length - x.e - 1;
		d.c[0] = POWS_TEN[(exp = e % LOG_BASE) < 0 ? LOG_BASE + exp : exp];
		md = !md || n.comparedTo(d) > 0 ? e > 0 ? d : n1 : n;
		exp = MAX_EXP;
		MAX_EXP = Infinity;
		n = new BigNumber(s);
		n0.c[0] = 0;
		for (;;) {
			q = div(n, d, 0, 1);
			d2 = d0.plus(q.times(d1));
			if (d2.comparedTo(md) == 1) break;
			d0 = d1;
			d1 = d2;
			n1 = n0.plus(q.times(d2 = n1));
			n0 = d2;
			d = n.minus(q.times(d2 = d));
			n = d2;
		}
		d2 = div(md.minus(d0), d1, 0, 1);
		n0 = n0.plus(d2.times(n1));
		d0 = d0.plus(d2.times(d1));
		n0.s = n1.s = x.s;
		e = e * 2;
		r = div(n1, d1, e, ROUNDING_MODE).minus(x).abs().comparedTo(div(n0, d0, e, ROUNDING_MODE).minus(x).abs()) < 1 ? [n1, d1] : [n0, d0];
		MAX_EXP = exp;
		return r;
	};
	P.toNumber = function() {
		return +valueOf(this);
	};
	P.toPrecision = function(sd, rm) {
		if (sd != null) intCheck(sd, 1, MAX);
		return format(this, sd, rm, 2);
	};
	P.toString = function(b) {
		var str, n = this, s = n.s, e = n.e;
		if (e === null) if (s) {
			str = "Infinity";
			if (s < 0) str = "-" + str;
		} else str = "NaN";
		else {
			if (b == null) str = e <= TO_EXP_NEG || e >= TO_EXP_POS ? toExponential(coeffToString(n.c), e) : toFixedPoint(coeffToString(n.c), e, "0");
			else if (b === 10 && alphabetHasNormalDecimalDigits) {
				n = round(new BigNumber(n), DECIMAL_PLACES + e + 1, ROUNDING_MODE);
				str = toFixedPoint(coeffToString(n.c), n.e, "0");
			} else {
				intCheck(b, 2, ALPHABET.length, "Base");
				str = convertBase(toFixedPoint(coeffToString(n.c), e, "0"), 10, b, s, true);
			}
			if (s < 0 && n.c[0]) str = "-" + str;
		}
		return str;
	};
	P.valueOf = P.toJSON = function() {
		return valueOf(this);
	};
	P._isBigNumber = true;
	P[Symbol.toStringTag] = "BigNumber";
	P[Symbol.for("nodejs.util.inspect.custom")] = P.valueOf;
	if (configObject != null) BigNumber.set(configObject);
	return BigNumber;
}
function bitFloor(n) {
	var i = n | 0;
	return n > 0 || n === i ? i : i - 1;
}
function coeffToString(a) {
	var s, z, i = 1, j = a.length, r = a[0] + "";
	for (; i < j;) {
		s = a[i++] + "";
		z = LOG_BASE - s.length;
		for (; z--; s = "0" + s);
		r += s;
	}
	for (j = r.length; r.charCodeAt(--j) === 48;);
	return r.slice(0, j + 1 || 1);
}
function compare(x, y) {
	var a, b, xc = x.c, yc = y.c, i = x.s, j = y.s, k = x.e, l = y.e;
	if (!i || !j) return null;
	a = xc && !xc[0];
	b = yc && !yc[0];
	if (a || b) return a ? b ? 0 : -j : i;
	if (i != j) return i;
	a = i < 0;
	b = k == l;
	if (!xc || !yc) return b ? 0 : !xc ^ a ? 1 : -1;
	if (!b) return k > l ^ a ? 1 : -1;
	j = (k = xc.length) < (l = yc.length) ? k : l;
	for (i = 0; i < j; i++) if (xc[i] != yc[i]) return xc[i] > yc[i] ^ a ? 1 : -1;
	return k == l ? 0 : k > l ^ a ? 1 : -1;
}
function intCheck(n, min, max, name) {
	if (n < min || n > max || n !== mathfloor(n)) throw Error(bignumberError + (name || "Argument") + (typeof n == "number" ? n < min || n > max ? " out of range: " : " not an integer: " : " not a primitive number: ") + String(n));
}
function isOdd(n) {
	var k = n.c.length - 1;
	return bitFloor(n.e / LOG_BASE) == k && n.c[k] % 2 != 0;
}
function toExponential(str, e) {
	return (str.length > 1 ? str.charAt(0) + "." + str.slice(1) : str) + (e < 0 ? "e" : "e+") + e;
}
function toFixedPoint(str, e, z) {
	var len, zs;
	if (e < 0) {
		for (zs = z + "."; ++e; zs += z);
		str = zs + str;
	} else {
		len = str.length;
		if (++e > len) {
			for (zs = z, e -= len; --e; zs += z);
			str += zs;
		} else if (e < len) str = str.slice(0, e) + "." + str.slice(e);
	}
	return str;
}
var BigNumber = clone();
//#endregion
//#region node_modules/splaytree-ts/dist/esm/index.js
var SplayTreeNode = class {
	key;
	left = null;
	right = null;
	constructor(key) {
		this.key = key;
	}
};
var SplayTreeSetNode = class extends SplayTreeNode {
	constructor(key) {
		super(key);
	}
};
var SplayTree = class {
	size = 0;
	modificationCount = 0;
	splayCount = 0;
	splay(key) {
		const root = this.root;
		if (root == null) {
			this.compare(key, key);
			return -1;
		}
		let right = null;
		let newTreeRight = null;
		let left = null;
		let newTreeLeft = null;
		let current = root;
		const compare = this.compare;
		let comp;
		while (true) {
			comp = compare(current.key, key);
			if (comp > 0) {
				let currentLeft = current.left;
				if (currentLeft == null) break;
				comp = compare(currentLeft.key, key);
				if (comp > 0) {
					current.left = currentLeft.right;
					currentLeft.right = current;
					current = currentLeft;
					currentLeft = current.left;
					if (currentLeft == null) break;
				}
				if (right == null) newTreeRight = current;
				else right.left = current;
				right = current;
				current = currentLeft;
			} else if (comp < 0) {
				let currentRight = current.right;
				if (currentRight == null) break;
				comp = compare(currentRight.key, key);
				if (comp < 0) {
					current.right = currentRight.left;
					currentRight.left = current;
					current = currentRight;
					currentRight = current.right;
					if (currentRight == null) break;
				}
				if (left == null) newTreeLeft = current;
				else left.right = current;
				left = current;
				current = currentRight;
			} else break;
		}
		if (left != null) {
			left.right = current.left;
			current.left = newTreeLeft;
		}
		if (right != null) {
			right.left = current.right;
			current.right = newTreeRight;
		}
		if (this.root !== current) {
			this.root = current;
			this.splayCount++;
		}
		return comp;
	}
	splayMin(node) {
		let current = node;
		let nextLeft = current.left;
		while (nextLeft != null) {
			const left = nextLeft;
			current.left = left.right;
			left.right = current;
			current = left;
			nextLeft = current.left;
		}
		return current;
	}
	splayMax(node) {
		let current = node;
		let nextRight = current.right;
		while (nextRight != null) {
			const right = nextRight;
			current.right = right.left;
			right.left = current;
			current = right;
			nextRight = current.right;
		}
		return current;
	}
	_delete(key) {
		if (this.root == null) return null;
		if (this.splay(key) != 0) return null;
		let root = this.root;
		const result = root;
		const left = root.left;
		this.size--;
		if (left == null) this.root = root.right;
		else {
			const right = root.right;
			root = this.splayMax(left);
			root.right = right;
			this.root = root;
		}
		this.modificationCount++;
		return result;
	}
	addNewRoot(node, comp) {
		this.size++;
		this.modificationCount++;
		const root = this.root;
		if (root == null) {
			this.root = node;
			return;
		}
		if (comp < 0) {
			node.left = root;
			node.right = root.right;
			root.right = null;
		} else {
			node.right = root;
			node.left = root.left;
			root.left = null;
		}
		this.root = node;
	}
	_first() {
		const root = this.root;
		if (root == null) return null;
		this.root = this.splayMin(root);
		return this.root;
	}
	_last() {
		const root = this.root;
		if (root == null) return null;
		this.root = this.splayMax(root);
		return this.root;
	}
	clear() {
		this.root = null;
		this.size = 0;
		this.modificationCount++;
	}
	has(key) {
		return this.validKey(key) && this.splay(key) == 0;
	}
	defaultCompare() {
		return (a, b) => a < b ? -1 : a > b ? 1 : 0;
	}
	wrap() {
		return {
			getRoot: () => {
				return this.root;
			},
			setRoot: (root) => {
				this.root = root;
			},
			getSize: () => {
				return this.size;
			},
			getModificationCount: () => {
				return this.modificationCount;
			},
			getSplayCount: () => {
				return this.splayCount;
			},
			setSplayCount: (count) => {
				this.splayCount = count;
			},
			splay: (key) => {
				return this.splay(key);
			},
			has: (key) => {
				return this.has(key);
			}
		};
	}
};
var SplayTreeSet = class _SplayTreeSet extends SplayTree {
	root = null;
	compare;
	validKey;
	constructor(compare, isValidKey) {
		super();
		this.compare = compare ?? this.defaultCompare();
		this.validKey = isValidKey ?? ((v) => v != null && v != void 0);
	}
	delete(element) {
		if (!this.validKey(element)) return false;
		return this._delete(element) != null;
	}
	deleteAll(elements) {
		for (const element of elements) this.delete(element);
	}
	forEach(f) {
		const nodes = this[Symbol.iterator]();
		let result;
		while (result = nodes.next(), !result.done) f(result.value, result.value, this);
	}
	add(element) {
		const compare = this.splay(element);
		if (compare != 0) this.addNewRoot(new SplayTreeSetNode(element), compare);
		return this;
	}
	addAndReturn(element) {
		const compare = this.splay(element);
		if (compare != 0) this.addNewRoot(new SplayTreeSetNode(element), compare);
		return this.root.key;
	}
	addAll(elements) {
		for (const element of elements) this.add(element);
	}
	isEmpty() {
		return this.root == null;
	}
	isNotEmpty() {
		return this.root != null;
	}
	single() {
		if (this.size == 0) throw "Bad state: No element";
		if (this.size > 1) throw "Bad state: Too many element";
		return this.root.key;
	}
	first() {
		if (this.size == 0) throw "Bad state: No element";
		return this._first().key;
	}
	last() {
		if (this.size == 0) throw "Bad state: No element";
		return this._last().key;
	}
	lastBefore(element) {
		if (element == null) throw "Invalid arguments(s)";
		if (this.root == null) return null;
		if (this.splay(element) < 0) return this.root.key;
		let node = this.root.left;
		if (node == null) return null;
		let nodeRight = node.right;
		while (nodeRight != null) {
			node = nodeRight;
			nodeRight = node.right;
		}
		return node.key;
	}
	firstAfter(element) {
		if (element == null) throw "Invalid arguments(s)";
		if (this.root == null) return null;
		if (this.splay(element) > 0) return this.root.key;
		let node = this.root.right;
		if (node == null) return null;
		let nodeLeft = node.left;
		while (nodeLeft != null) {
			node = nodeLeft;
			nodeLeft = node.left;
		}
		return node.key;
	}
	retainAll(elements) {
		const retainSet = new _SplayTreeSet(this.compare, this.validKey);
		const modificationCount = this.modificationCount;
		for (const object of elements) {
			if (modificationCount != this.modificationCount) throw "Concurrent modification during iteration.";
			if (this.validKey(object) && this.splay(object) == 0) retainSet.add(this.root.key);
		}
		if (retainSet.size != this.size) {
			this.root = retainSet.root;
			this.size = retainSet.size;
			this.modificationCount++;
		}
	}
	lookup(object) {
		if (!this.validKey(object)) return null;
		if (this.splay(object) != 0) return null;
		return this.root.key;
	}
	intersection(other) {
		const result = new _SplayTreeSet(this.compare, this.validKey);
		for (const element of this) if (other.has(element)) result.add(element);
		return result;
	}
	difference(other) {
		const result = new _SplayTreeSet(this.compare, this.validKey);
		for (const element of this) if (!other.has(element)) result.add(element);
		return result;
	}
	union(other) {
		const u = this.clone();
		u.addAll(other);
		return u;
	}
	clone() {
		const set = new _SplayTreeSet(this.compare, this.validKey);
		set.size = this.size;
		set.root = this.copyNode(this.root);
		return set;
	}
	copyNode(node) {
		if (node == null) return null;
		function copyChildren(node2, dest) {
			let left;
			let right;
			do {
				left = node2.left;
				right = node2.right;
				if (left != null) {
					const newLeft = new SplayTreeSetNode(left.key);
					dest.left = newLeft;
					copyChildren(left, newLeft);
				}
				if (right != null) {
					const newRight = new SplayTreeSetNode(right.key);
					dest.right = newRight;
					node2 = right;
					dest = newRight;
				}
			} while (right != null);
		}
		const result = new SplayTreeSetNode(node.key);
		copyChildren(node, result);
		return result;
	}
	toSet() {
		return this.clone();
	}
	entries() {
		return new SplayTreeSetEntryIterableIterator(this.wrap());
	}
	keys() {
		return this[Symbol.iterator]();
	}
	values() {
		return this[Symbol.iterator]();
	}
	[Symbol.iterator]() {
		return new SplayTreeKeyIterableIterator(this.wrap());
	}
	[Symbol.toStringTag] = "[object Set]";
};
var SplayTreeIterableIterator = class {
	tree;
	path = new Array();
	modificationCount = null;
	splayCount;
	constructor(tree) {
		this.tree = tree;
		this.splayCount = tree.getSplayCount();
	}
	[Symbol.iterator]() {
		return this;
	}
	next() {
		if (this.moveNext()) return {
			done: false,
			value: this.current()
		};
		return {
			done: true,
			value: null
		};
	}
	current() {
		if (!this.path.length) return null;
		const node = this.path[this.path.length - 1];
		return this.getValue(node);
	}
	rebuildPath(key) {
		this.path.splice(0, this.path.length);
		this.tree.splay(key);
		this.path.push(this.tree.getRoot());
		this.splayCount = this.tree.getSplayCount();
	}
	findLeftMostDescendent(node) {
		while (node != null) {
			this.path.push(node);
			node = node.left;
		}
	}
	moveNext() {
		if (this.modificationCount != this.tree.getModificationCount()) {
			if (this.modificationCount == null) {
				this.modificationCount = this.tree.getModificationCount();
				let node2 = this.tree.getRoot();
				while (node2 != null) {
					this.path.push(node2);
					node2 = node2.left;
				}
				return this.path.length > 0;
			}
			throw "Concurrent modification during iteration.";
		}
		if (!this.path.length) return false;
		if (this.splayCount != this.tree.getSplayCount()) this.rebuildPath(this.path[this.path.length - 1].key);
		let node = this.path[this.path.length - 1];
		let next = node.right;
		if (next != null) {
			while (next != null) {
				this.path.push(next);
				next = next.left;
			}
			return true;
		}
		this.path.pop();
		while (this.path.length && this.path[this.path.length - 1].right === node) node = this.path.pop();
		return this.path.length > 0;
	}
};
var SplayTreeKeyIterableIterator = class extends SplayTreeIterableIterator {
	getValue(node) {
		return node.key;
	}
};
var SplayTreeSetEntryIterableIterator = class extends SplayTreeIterableIterator {
	getValue(node) {
		return [node.key, node.key];
	}
};
//#endregion
//#region node_modules/polyclip-ts/dist/esm/index.js
var constant_default = (x) => {
	return () => {
		return x;
	};
};
var compare_default = (eps) => {
	const almostEqual = eps ? (a, b) => b.minus(a).abs().isLessThanOrEqualTo(eps) : constant_default(false);
	return (a, b) => {
		if (almostEqual(a, b)) return 0;
		return a.comparedTo(b);
	};
};
function orient_default(eps) {
	const almostCollinear = eps ? (area2, ax, ay, cx, cy) => area2.exponentiatedBy(2).isLessThanOrEqualTo(cx.minus(ax).exponentiatedBy(2).plus(cy.minus(ay).exponentiatedBy(2)).times(eps)) : constant_default(false);
	return (a, b, c) => {
		const ax = a.x, ay = a.y, cx = c.x, cy = c.y;
		const area2 = ay.minus(cy).times(b.x.minus(cx)).minus(ax.minus(cx).times(b.y.minus(cy)));
		if (almostCollinear(area2, ax, ay, cx, cy)) return 0;
		return area2.comparedTo(0);
	};
}
var identity_default = (x) => {
	return x;
};
var snap_default = (eps) => {
	if (eps) {
		const xTree = new SplayTreeSet(compare_default(eps));
		const yTree = new SplayTreeSet(compare_default(eps));
		const snapCoord = (coord, tree) => {
			return tree.addAndReturn(coord);
		};
		const snap = (v) => {
			return {
				x: snapCoord(v.x, xTree),
				y: snapCoord(v.y, yTree)
			};
		};
		snap({
			x: new BigNumber(0),
			y: new BigNumber(0)
		});
		return snap;
	}
	return identity_default;
};
var set = (eps) => {
	return {
		set: (eps2) => {
			precision = set(eps2);
		},
		reset: () => set(eps),
		compare: compare_default(eps),
		snap: snap_default(eps),
		orient: orient_default(eps)
	};
};
var precision = set();
var isInBbox = (bbox, point) => {
	return bbox.ll.x.isLessThanOrEqualTo(point.x) && point.x.isLessThanOrEqualTo(bbox.ur.x) && bbox.ll.y.isLessThanOrEqualTo(point.y) && point.y.isLessThanOrEqualTo(bbox.ur.y);
};
var getBboxOverlap = (b1, b2) => {
	if (b2.ur.x.isLessThan(b1.ll.x) || b1.ur.x.isLessThan(b2.ll.x) || b2.ur.y.isLessThan(b1.ll.y) || b1.ur.y.isLessThan(b2.ll.y)) return null;
	const lowerX = b1.ll.x.isLessThan(b2.ll.x) ? b2.ll.x : b1.ll.x;
	const upperX = b1.ur.x.isLessThan(b2.ur.x) ? b1.ur.x : b2.ur.x;
	const lowerY = b1.ll.y.isLessThan(b2.ll.y) ? b2.ll.y : b1.ll.y;
	const upperY = b1.ur.y.isLessThan(b2.ur.y) ? b1.ur.y : b2.ur.y;
	return {
		ll: {
			x: lowerX,
			y: lowerY
		},
		ur: {
			x: upperX,
			y: upperY
		}
	};
};
var crossProduct = (a, b) => a.x.times(b.y).minus(a.y.times(b.x));
var dotProduct = (a, b) => a.x.times(b.x).plus(a.y.times(b.y));
var length = (v) => dotProduct(v, v).sqrt();
var sineOfAngle = (pShared, pBase, pAngle) => {
	const vBase = {
		x: pBase.x.minus(pShared.x),
		y: pBase.y.minus(pShared.y)
	};
	const vAngle = {
		x: pAngle.x.minus(pShared.x),
		y: pAngle.y.minus(pShared.y)
	};
	return crossProduct(vAngle, vBase).div(length(vAngle)).div(length(vBase));
};
var cosineOfAngle = (pShared, pBase, pAngle) => {
	const vBase = {
		x: pBase.x.minus(pShared.x),
		y: pBase.y.minus(pShared.y)
	};
	const vAngle = {
		x: pAngle.x.minus(pShared.x),
		y: pAngle.y.minus(pShared.y)
	};
	return dotProduct(vAngle, vBase).div(length(vAngle)).div(length(vBase));
};
var horizontalIntersection = (pt, v, y) => {
	if (v.y.isZero()) return null;
	return {
		x: pt.x.plus(v.x.div(v.y).times(y.minus(pt.y))),
		y
	};
};
var verticalIntersection = (pt, v, x) => {
	if (v.x.isZero()) return null;
	return {
		x,
		y: pt.y.plus(v.y.div(v.x).times(x.minus(pt.x)))
	};
};
var intersection = (pt1, v1, pt2, v2) => {
	if (v1.x.isZero()) return verticalIntersection(pt2, v2, pt1.x);
	if (v2.x.isZero()) return verticalIntersection(pt1, v1, pt2.x);
	if (v1.y.isZero()) return horizontalIntersection(pt2, v2, pt1.y);
	if (v2.y.isZero()) return horizontalIntersection(pt1, v1, pt2.y);
	const kross = crossProduct(v1, v2);
	if (kross.isZero()) return null;
	const ve = {
		x: pt2.x.minus(pt1.x),
		y: pt2.y.minus(pt1.y)
	};
	const d1 = crossProduct(ve, v1).div(kross);
	const d2 = crossProduct(ve, v2).div(kross);
	const x1 = pt1.x.plus(d2.times(v1.x)), x2 = pt2.x.plus(d1.times(v2.x));
	const y1 = pt1.y.plus(d2.times(v1.y)), y2 = pt2.y.plus(d1.times(v2.y));
	return {
		x: x1.plus(x2).div(2),
		y: y1.plus(y2).div(2)
	};
};
var SweepEvent = class _SweepEvent {
	point;
	isLeft;
	segment;
	otherSE;
	consumedBy;
	static compare(a, b) {
		const ptCmp = _SweepEvent.comparePoints(a.point, b.point);
		if (ptCmp !== 0) return ptCmp;
		if (a.point !== b.point) a.link(b);
		if (a.isLeft !== b.isLeft) return a.isLeft ? 1 : -1;
		return Segment.compare(a.segment, b.segment);
	}
	static comparePoints(aPt, bPt) {
		if (aPt.x.isLessThan(bPt.x)) return -1;
		if (aPt.x.isGreaterThan(bPt.x)) return 1;
		if (aPt.y.isLessThan(bPt.y)) return -1;
		if (aPt.y.isGreaterThan(bPt.y)) return 1;
		return 0;
	}
	constructor(point, isLeft) {
		if (point.events === void 0) point.events = [this];
		else point.events.push(this);
		this.point = point;
		this.isLeft = isLeft;
	}
	link(other) {
		if (other.point === this.point) throw new Error("Tried to link already linked events");
		const otherEvents = other.point.events;
		for (let i = 0, iMax = otherEvents.length; i < iMax; i++) {
			const evt = otherEvents[i];
			this.point.events.push(evt);
			evt.point = this.point;
		}
		this.checkForConsuming();
	}
	checkForConsuming() {
		const numEvents = this.point.events.length;
		for (let i = 0; i < numEvents; i++) {
			const evt1 = this.point.events[i];
			if (evt1.segment.consumedBy !== void 0) continue;
			for (let j = i + 1; j < numEvents; j++) {
				const evt2 = this.point.events[j];
				if (evt2.consumedBy !== void 0) continue;
				if (evt1.otherSE.point.events !== evt2.otherSE.point.events) continue;
				evt1.segment.consume(evt2.segment);
			}
		}
	}
	getAvailableLinkedEvents() {
		const events = [];
		for (let i = 0, iMax = this.point.events.length; i < iMax; i++) {
			const evt = this.point.events[i];
			if (evt !== this && !evt.segment.ringOut && evt.segment.isInResult()) events.push(evt);
		}
		return events;
	}
	/**
	* Returns a comparator function for sorting linked events that will
	* favor the event that will give us the smallest left-side angle.
	* All ring construction starts as low as possible heading to the right,
	* so by always turning left as sharp as possible we'll get polygons
	* without uncessary loops & holes.
	*
	* The comparator function has a compute cache such that it avoids
	* re-computing already-computed values.
	*/
	getLeftmostComparator(baseEvent) {
		const cache = /* @__PURE__ */ new Map();
		const fillCache = (linkedEvent) => {
			const nextEvent = linkedEvent.otherSE;
			cache.set(linkedEvent, {
				sine: sineOfAngle(this.point, baseEvent.point, nextEvent.point),
				cosine: cosineOfAngle(this.point, baseEvent.point, nextEvent.point)
			});
		};
		return (a, b) => {
			if (!cache.has(a)) fillCache(a);
			if (!cache.has(b)) fillCache(b);
			const { sine: asine, cosine: acosine } = cache.get(a);
			const { sine: bsine, cosine: bcosine } = cache.get(b);
			if (asine.isGreaterThanOrEqualTo(0) && bsine.isGreaterThanOrEqualTo(0)) {
				if (acosine.isLessThan(bcosine)) return 1;
				if (acosine.isGreaterThan(bcosine)) return -1;
				return 0;
			}
			if (asine.isLessThan(0) && bsine.isLessThan(0)) {
				if (acosine.isLessThan(bcosine)) return -1;
				if (acosine.isGreaterThan(bcosine)) return 1;
				return 0;
			}
			if (bsine.isLessThan(asine)) return -1;
			if (bsine.isGreaterThan(asine)) return 1;
			return 0;
		};
	}
};
var RingOut = class _RingOut {
	events;
	poly;
	_isExteriorRing;
	_enclosingRing;
	static factory(allSegments) {
		const ringsOut = [];
		for (let i = 0, iMax = allSegments.length; i < iMax; i++) {
			const segment = allSegments[i];
			if (!segment.isInResult() || segment.ringOut) continue;
			let prevEvent = null;
			let event = segment.leftSE;
			let nextEvent = segment.rightSE;
			const events = [event];
			const startingPoint = event.point;
			const intersectionLEs = [];
			while (true) {
				prevEvent = event;
				event = nextEvent;
				events.push(event);
				if (event.point === startingPoint) break;
				while (true) {
					const availableLEs = event.getAvailableLinkedEvents();
					if (availableLEs.length === 0) {
						const firstPt = events[0].point;
						const lastPt = events[events.length - 1].point;
						throw new Error(`Unable to complete output ring starting at [${firstPt.x}, ${firstPt.y}]. Last matching segment found ends at [${lastPt.x}, ${lastPt.y}].`);
					}
					if (availableLEs.length === 1) {
						nextEvent = availableLEs[0].otherSE;
						break;
					}
					let indexLE = null;
					for (let j = 0, jMax = intersectionLEs.length; j < jMax; j++) if (intersectionLEs[j].point === event.point) {
						indexLE = j;
						break;
					}
					if (indexLE !== null) {
						const intersectionLE = intersectionLEs.splice(indexLE)[0];
						const ringEvents = events.splice(intersectionLE.index);
						ringEvents.unshift(ringEvents[0].otherSE);
						ringsOut.push(new _RingOut(ringEvents.reverse()));
						continue;
					}
					intersectionLEs.push({
						index: events.length,
						point: event.point
					});
					const comparator = event.getLeftmostComparator(prevEvent);
					nextEvent = availableLEs.sort(comparator)[0].otherSE;
					break;
				}
			}
			ringsOut.push(new _RingOut(events));
		}
		return ringsOut;
	}
	constructor(events) {
		this.events = events;
		for (let i = 0, iMax = events.length; i < iMax; i++) events[i].segment.ringOut = this;
		this.poly = null;
	}
	getGeom() {
		let prevPt = this.events[0].point;
		const points = [prevPt];
		for (let i = 1, iMax = this.events.length - 1; i < iMax; i++) {
			const pt2 = this.events[i].point;
			const nextPt2 = this.events[i + 1].point;
			if (precision.orient(pt2, prevPt, nextPt2) === 0) continue;
			points.push(pt2);
			prevPt = pt2;
		}
		if (points.length === 1) return null;
		const pt = points[0];
		const nextPt = points[1];
		if (precision.orient(pt, prevPt, nextPt) === 0) points.shift();
		points.push(points[0]);
		const step = this.isExteriorRing() ? 1 : -1;
		const iStart = this.isExteriorRing() ? 0 : points.length - 1;
		const iEnd = this.isExteriorRing() ? points.length : -1;
		const orderedPoints = [];
		for (let i = iStart; i != iEnd; i += step) orderedPoints.push([points[i].x.toNumber(), points[i].y.toNumber()]);
		return orderedPoints;
	}
	isExteriorRing() {
		if (this._isExteriorRing === void 0) {
			const enclosing = this.enclosingRing();
			this._isExteriorRing = enclosing ? !enclosing.isExteriorRing() : true;
		}
		return this._isExteriorRing;
	}
	enclosingRing() {
		if (this._enclosingRing === void 0) this._enclosingRing = this._calcEnclosingRing();
		return this._enclosingRing;
	}
	_calcEnclosingRing() {
		let leftMostEvt = this.events[0];
		for (let i = 1, iMax = this.events.length; i < iMax; i++) {
			const evt = this.events[i];
			if (SweepEvent.compare(leftMostEvt, evt) > 0) leftMostEvt = evt;
		}
		let prevSeg = leftMostEvt.segment.prevInResult();
		let prevPrevSeg = prevSeg ? prevSeg.prevInResult() : null;
		while (true) {
			if (!prevSeg) return null;
			if (!prevPrevSeg) return prevSeg.ringOut;
			if (prevPrevSeg.ringOut !== prevSeg.ringOut) if (prevPrevSeg.ringOut?.enclosingRing() !== prevSeg.ringOut) return prevSeg.ringOut;
			else return prevSeg.ringOut?.enclosingRing();
			prevSeg = prevPrevSeg.prevInResult();
			prevPrevSeg = prevSeg ? prevSeg.prevInResult() : null;
		}
	}
};
var PolyOut = class {
	exteriorRing;
	interiorRings;
	constructor(exteriorRing) {
		this.exteriorRing = exteriorRing;
		exteriorRing.poly = this;
		this.interiorRings = [];
	}
	addInterior(ring) {
		this.interiorRings.push(ring);
		ring.poly = this;
	}
	getGeom() {
		const geom0 = this.exteriorRing.getGeom();
		if (geom0 === null) return null;
		const geom = [geom0];
		for (let i = 0, iMax = this.interiorRings.length; i < iMax; i++) {
			const ringGeom = this.interiorRings[i].getGeom();
			if (ringGeom === null) continue;
			geom.push(ringGeom);
		}
		return geom;
	}
};
var MultiPolyOut = class {
	rings;
	polys;
	constructor(rings) {
		this.rings = rings;
		this.polys = this._composePolys(rings);
	}
	getGeom() {
		const geom = [];
		for (let i = 0, iMax = this.polys.length; i < iMax; i++) {
			const polyGeom = this.polys[i].getGeom();
			if (polyGeom === null) continue;
			geom.push(polyGeom);
		}
		return geom;
	}
	_composePolys(rings) {
		const polys = [];
		for (let i = 0, iMax = rings.length; i < iMax; i++) {
			const ring = rings[i];
			if (ring.poly) continue;
			if (ring.isExteriorRing()) polys.push(new PolyOut(ring));
			else {
				const enclosingRing = ring.enclosingRing();
				if (!enclosingRing?.poly) polys.push(new PolyOut(enclosingRing));
				enclosingRing?.poly?.addInterior(ring);
			}
		}
		return polys;
	}
};
var SweepLine = class {
	queue;
	tree;
	segments;
	constructor(queue, comparator = Segment.compare) {
		this.queue = queue;
		this.tree = new SplayTreeSet(comparator);
		this.segments = [];
	}
	process(event) {
		const segment = event.segment;
		const newEvents = [];
		if (event.consumedBy) {
			if (event.isLeft) this.queue.delete(event.otherSE);
			else this.tree.delete(segment);
			return newEvents;
		}
		if (event.isLeft) this.tree.add(segment);
		let prevSeg = segment;
		let nextSeg = segment;
		do
			prevSeg = this.tree.lastBefore(prevSeg);
		while (prevSeg != null && prevSeg.consumedBy != void 0);
		do
			nextSeg = this.tree.firstAfter(nextSeg);
		while (nextSeg != null && nextSeg.consumedBy != void 0);
		if (event.isLeft) {
			let prevMySplitter = null;
			if (prevSeg) {
				const prevInter = prevSeg.getIntersection(segment);
				if (prevInter !== null) {
					if (!segment.isAnEndpoint(prevInter)) prevMySplitter = prevInter;
					if (!prevSeg.isAnEndpoint(prevInter)) {
						const newEventsFromSplit = this._splitSafely(prevSeg, prevInter);
						for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) newEvents.push(newEventsFromSplit[i]);
					}
				}
			}
			let nextMySplitter = null;
			if (nextSeg) {
				const nextInter = nextSeg.getIntersection(segment);
				if (nextInter !== null) {
					if (!segment.isAnEndpoint(nextInter)) nextMySplitter = nextInter;
					if (!nextSeg.isAnEndpoint(nextInter)) {
						const newEventsFromSplit = this._splitSafely(nextSeg, nextInter);
						for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) newEvents.push(newEventsFromSplit[i]);
					}
				}
			}
			if (prevMySplitter !== null || nextMySplitter !== null) {
				let mySplitter = null;
				if (prevMySplitter === null) mySplitter = nextMySplitter;
				else if (nextMySplitter === null) mySplitter = prevMySplitter;
				else mySplitter = SweepEvent.comparePoints(prevMySplitter, nextMySplitter) <= 0 ? prevMySplitter : nextMySplitter;
				this.queue.delete(segment.rightSE);
				newEvents.push(segment.rightSE);
				const newEventsFromSplit = segment.split(mySplitter);
				for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) newEvents.push(newEventsFromSplit[i]);
			}
			if (newEvents.length > 0) {
				this.tree.delete(segment);
				newEvents.push(event);
			} else {
				this.segments.push(segment);
				segment.prev = prevSeg;
			}
		} else {
			if (prevSeg && nextSeg) {
				const inter = prevSeg.getIntersection(nextSeg);
				if (inter !== null) {
					if (!prevSeg.isAnEndpoint(inter)) {
						const newEventsFromSplit = this._splitSafely(prevSeg, inter);
						for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) newEvents.push(newEventsFromSplit[i]);
					}
					if (!nextSeg.isAnEndpoint(inter)) {
						const newEventsFromSplit = this._splitSafely(nextSeg, inter);
						for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) newEvents.push(newEventsFromSplit[i]);
					}
				}
			}
			this.tree.delete(segment);
		}
		return newEvents;
	}
	_splitSafely(seg, pt) {
		this.tree.delete(seg);
		const rightSE = seg.rightSE;
		this.queue.delete(rightSE);
		const newEvents = seg.split(pt);
		newEvents.push(rightSE);
		if (seg.consumedBy === void 0) this.tree.add(seg);
		return newEvents;
	}
};
var Operation = class {
	type;
	numMultiPolys;
	run(type, geom, moreGeoms) {
		operation.type = type;
		const multipolys = [new MultiPolyIn(geom, true)];
		for (let i = 0, iMax = moreGeoms.length; i < iMax; i++) multipolys.push(new MultiPolyIn(moreGeoms[i], false));
		operation.numMultiPolys = multipolys.length;
		if (operation.type === "difference") {
			const subject = multipolys[0];
			let i = 1;
			while (i < multipolys.length) if (getBboxOverlap(multipolys[i].bbox, subject.bbox) !== null) i++;
			else multipolys.splice(i, 1);
		}
		if (operation.type === "intersection") for (let i = 0, iMax = multipolys.length; i < iMax; i++) {
			const mpA = multipolys[i];
			for (let j = i + 1, jMax = multipolys.length; j < jMax; j++) if (getBboxOverlap(mpA.bbox, multipolys[j].bbox) === null) return [];
		}
		const queue = new SplayTreeSet(SweepEvent.compare);
		for (let i = 0, iMax = multipolys.length; i < iMax; i++) {
			const sweepEvents = multipolys[i].getSweepEvents();
			for (let j = 0, jMax = sweepEvents.length; j < jMax; j++) queue.add(sweepEvents[j]);
		}
		const sweepLine = new SweepLine(queue);
		let evt = null;
		if (queue.size != 0) {
			evt = queue.first();
			queue.delete(evt);
		}
		while (evt) {
			const newEvents = sweepLine.process(evt);
			for (let i = 0, iMax = newEvents.length; i < iMax; i++) {
				const evt2 = newEvents[i];
				if (evt2.consumedBy === void 0) queue.add(evt2);
			}
			if (queue.size != 0) {
				evt = queue.first();
				queue.delete(evt);
			} else evt = null;
		}
		precision.reset();
		return new MultiPolyOut(RingOut.factory(sweepLine.segments)).getGeom();
	}
};
var operation = new Operation();
var operation_default = operation;
var segmentId = 0;
var Segment = class _Segment {
	id;
	leftSE;
	rightSE;
	rings;
	windings;
	ringOut;
	consumedBy;
	prev;
	_prevInResult;
	_beforeState;
	_afterState;
	_isInResult;
	static compare(a, b) {
		const alx = a.leftSE.point.x;
		const blx = b.leftSE.point.x;
		const arx = a.rightSE.point.x;
		const brx = b.rightSE.point.x;
		if (brx.isLessThan(alx)) return 1;
		if (arx.isLessThan(blx)) return -1;
		const aly = a.leftSE.point.y;
		const bly = b.leftSE.point.y;
		const ary = a.rightSE.point.y;
		const bry = b.rightSE.point.y;
		if (alx.isLessThan(blx)) {
			if (bly.isLessThan(aly) && bly.isLessThan(ary)) return 1;
			if (bly.isGreaterThan(aly) && bly.isGreaterThan(ary)) return -1;
			const aCmpBLeft = a.comparePoint(b.leftSE.point);
			if (aCmpBLeft < 0) return 1;
			if (aCmpBLeft > 0) return -1;
			const bCmpARight = b.comparePoint(a.rightSE.point);
			if (bCmpARight !== 0) return bCmpARight;
			return -1;
		}
		if (alx.isGreaterThan(blx)) {
			if (aly.isLessThan(bly) && aly.isLessThan(bry)) return -1;
			if (aly.isGreaterThan(bly) && aly.isGreaterThan(bry)) return 1;
			const bCmpALeft = b.comparePoint(a.leftSE.point);
			if (bCmpALeft !== 0) return bCmpALeft;
			const aCmpBRight = a.comparePoint(b.rightSE.point);
			if (aCmpBRight < 0) return 1;
			if (aCmpBRight > 0) return -1;
			return 1;
		}
		if (aly.isLessThan(bly)) return -1;
		if (aly.isGreaterThan(bly)) return 1;
		if (arx.isLessThan(brx)) {
			const bCmpARight = b.comparePoint(a.rightSE.point);
			if (bCmpARight !== 0) return bCmpARight;
		}
		if (arx.isGreaterThan(brx)) {
			const aCmpBRight = a.comparePoint(b.rightSE.point);
			if (aCmpBRight < 0) return 1;
			if (aCmpBRight > 0) return -1;
		}
		if (!arx.eq(brx)) {
			const ay = ary.minus(aly);
			const ax = arx.minus(alx);
			const by = bry.minus(bly);
			const bx = brx.minus(blx);
			if (ay.isGreaterThan(ax) && by.isLessThan(bx)) return 1;
			if (ay.isLessThan(ax) && by.isGreaterThan(bx)) return -1;
		}
		if (arx.isGreaterThan(brx)) return 1;
		if (arx.isLessThan(brx)) return -1;
		if (ary.isLessThan(bry)) return -1;
		if (ary.isGreaterThan(bry)) return 1;
		if (a.id < b.id) return -1;
		if (a.id > b.id) return 1;
		return 0;
	}
	constructor(leftSE, rightSE, rings, windings) {
		this.id = ++segmentId;
		this.leftSE = leftSE;
		leftSE.segment = this;
		leftSE.otherSE = rightSE;
		this.rightSE = rightSE;
		rightSE.segment = this;
		rightSE.otherSE = leftSE;
		this.rings = rings;
		this.windings = windings;
	}
	static fromRing(pt1, pt2, ring) {
		let leftPt, rightPt, winding;
		const cmpPts = SweepEvent.comparePoints(pt1, pt2);
		if (cmpPts < 0) {
			leftPt = pt1;
			rightPt = pt2;
			winding = 1;
		} else if (cmpPts > 0) {
			leftPt = pt2;
			rightPt = pt1;
			winding = -1;
		} else throw new Error(`Tried to create degenerate segment at [${pt1.x}, ${pt1.y}]`);
		return new _Segment(new SweepEvent(leftPt, true), new SweepEvent(rightPt, false), [ring], [winding]);
	}
	replaceRightSE(newRightSE) {
		this.rightSE = newRightSE;
		this.rightSE.segment = this;
		this.rightSE.otherSE = this.leftSE;
		this.leftSE.otherSE = this.rightSE;
	}
	bbox() {
		const y1 = this.leftSE.point.y;
		const y2 = this.rightSE.point.y;
		return {
			ll: {
				x: this.leftSE.point.x,
				y: y1.isLessThan(y2) ? y1 : y2
			},
			ur: {
				x: this.rightSE.point.x,
				y: y1.isGreaterThan(y2) ? y1 : y2
			}
		};
	}
	vector() {
		return {
			x: this.rightSE.point.x.minus(this.leftSE.point.x),
			y: this.rightSE.point.y.minus(this.leftSE.point.y)
		};
	}
	isAnEndpoint(pt) {
		return pt.x.eq(this.leftSE.point.x) && pt.y.eq(this.leftSE.point.y) || pt.x.eq(this.rightSE.point.x) && pt.y.eq(this.rightSE.point.y);
	}
	comparePoint(point) {
		return precision.orient(this.leftSE.point, point, this.rightSE.point);
	}
	/**
	* Given another segment, returns the first non-trivial intersection
	* between the two segments (in terms of sweep line ordering), if it exists.
	*
	* A 'non-trivial' intersection is one that will cause one or both of the
	* segments to be split(). As such, 'trivial' vs. 'non-trivial' intersection:
	*
	*   * endpoint of segA with endpoint of segB --> trivial
	*   * endpoint of segA with point along segB --> non-trivial
	*   * endpoint of segB with point along segA --> non-trivial
	*   * point along segA with point along segB --> non-trivial
	*
	* If no non-trivial intersection exists, return null
	* Else, return null.
	*/
	getIntersection(other) {
		const tBbox = this.bbox();
		const oBbox = other.bbox();
		const bboxOverlap = getBboxOverlap(tBbox, oBbox);
		if (bboxOverlap === null) return null;
		const tlp = this.leftSE.point;
		const trp = this.rightSE.point;
		const olp = other.leftSE.point;
		const orp = other.rightSE.point;
		const touchesOtherLSE = isInBbox(tBbox, olp) && this.comparePoint(olp) === 0;
		const touchesThisLSE = isInBbox(oBbox, tlp) && other.comparePoint(tlp) === 0;
		const touchesOtherRSE = isInBbox(tBbox, orp) && this.comparePoint(orp) === 0;
		const touchesThisRSE = isInBbox(oBbox, trp) && other.comparePoint(trp) === 0;
		if (touchesThisLSE && touchesOtherLSE) {
			if (touchesThisRSE && !touchesOtherRSE) return trp;
			if (!touchesThisRSE && touchesOtherRSE) return orp;
			return null;
		}
		if (touchesThisLSE) {
			if (touchesOtherRSE) {
				if (tlp.x.eq(orp.x) && tlp.y.eq(orp.y)) return null;
			}
			return tlp;
		}
		if (touchesOtherLSE) {
			if (touchesThisRSE) {
				if (trp.x.eq(olp.x) && trp.y.eq(olp.y)) return null;
			}
			return olp;
		}
		if (touchesThisRSE && touchesOtherRSE) return null;
		if (touchesThisRSE) return trp;
		if (touchesOtherRSE) return orp;
		const pt = intersection(tlp, this.vector(), olp, other.vector());
		if (pt === null) return null;
		if (!isInBbox(bboxOverlap, pt)) return null;
		return precision.snap(pt);
	}
	/**
	* Split the given segment into multiple segments on the given points.
	*  * Each existing segment will retain its leftSE and a new rightSE will be
	*    generated for it.
	*  * A new segment will be generated which will adopt the original segment's
	*    rightSE, and a new leftSE will be generated for it.
	*  * If there are more than two points given to split on, new segments
	*    in the middle will be generated with new leftSE and rightSE's.
	*  * An array of the newly generated SweepEvents will be returned.
	*
	* Warning: input array of points is modified
	*/
	split(point) {
		const newEvents = [];
		const alreadyLinked = point.events !== void 0;
		const newLeftSE = new SweepEvent(point, true);
		const newRightSE = new SweepEvent(point, false);
		const oldRightSE = this.rightSE;
		this.replaceRightSE(newRightSE);
		newEvents.push(newRightSE);
		newEvents.push(newLeftSE);
		const newSeg = new _Segment(newLeftSE, oldRightSE, this.rings.slice(), this.windings.slice());
		if (SweepEvent.comparePoints(newSeg.leftSE.point, newSeg.rightSE.point) > 0) newSeg.swapEvents();
		if (SweepEvent.comparePoints(this.leftSE.point, this.rightSE.point) > 0) this.swapEvents();
		if (alreadyLinked) {
			newLeftSE.checkForConsuming();
			newRightSE.checkForConsuming();
		}
		return newEvents;
	}
	swapEvents() {
		const tmpEvt = this.rightSE;
		this.rightSE = this.leftSE;
		this.leftSE = tmpEvt;
		this.leftSE.isLeft = true;
		this.rightSE.isLeft = false;
		for (let i = 0, iMax = this.windings.length; i < iMax; i++) this.windings[i] *= -1;
	}
	consume(other) {
		let consumer = this;
		let consumee = other;
		while (consumer.consumedBy) consumer = consumer.consumedBy;
		while (consumee.consumedBy) consumee = consumee.consumedBy;
		const cmp = _Segment.compare(consumer, consumee);
		if (cmp === 0) return;
		if (cmp > 0) {
			const tmp = consumer;
			consumer = consumee;
			consumee = tmp;
		}
		if (consumer.prev === consumee) {
			const tmp = consumer;
			consumer = consumee;
			consumee = tmp;
		}
		for (let i = 0, iMax = consumee.rings.length; i < iMax; i++) {
			const ring = consumee.rings[i];
			const winding = consumee.windings[i];
			const index = consumer.rings.indexOf(ring);
			if (index === -1) {
				consumer.rings.push(ring);
				consumer.windings.push(winding);
			} else consumer.windings[index] += winding;
		}
		consumee.rings = null;
		consumee.windings = null;
		consumee.consumedBy = consumer;
		consumee.leftSE.consumedBy = consumer.leftSE;
		consumee.rightSE.consumedBy = consumer.rightSE;
	}
	prevInResult() {
		if (this._prevInResult !== void 0) return this._prevInResult;
		if (!this.prev) this._prevInResult = null;
		else if (this.prev.isInResult()) this._prevInResult = this.prev;
		else this._prevInResult = this.prev.prevInResult();
		return this._prevInResult;
	}
	beforeState() {
		if (this._beforeState !== void 0) return this._beforeState;
		if (!this.prev) this._beforeState = {
			rings: [],
			windings: [],
			multiPolys: []
		};
		else {
			const seg = this.prev.consumedBy || this.prev;
			this._beforeState = seg.afterState();
		}
		return this._beforeState;
	}
	afterState() {
		if (this._afterState !== void 0) return this._afterState;
		const beforeState = this.beforeState();
		this._afterState = {
			rings: beforeState.rings.slice(0),
			windings: beforeState.windings.slice(0),
			multiPolys: []
		};
		const ringsAfter = this._afterState.rings;
		const windingsAfter = this._afterState.windings;
		const mpsAfter = this._afterState.multiPolys;
		for (let i = 0, iMax = this.rings.length; i < iMax; i++) {
			const ring = this.rings[i];
			const winding = this.windings[i];
			const index = ringsAfter.indexOf(ring);
			if (index === -1) {
				ringsAfter.push(ring);
				windingsAfter.push(winding);
			} else windingsAfter[index] += winding;
		}
		const polysAfter = [];
		const polysExclude = [];
		for (let i = 0, iMax = ringsAfter.length; i < iMax; i++) {
			if (windingsAfter[i] === 0) continue;
			const ring = ringsAfter[i];
			const poly = ring.poly;
			if (polysExclude.indexOf(poly) !== -1) continue;
			if (ring.isExterior) polysAfter.push(poly);
			else {
				if (polysExclude.indexOf(poly) === -1) polysExclude.push(poly);
				const index = polysAfter.indexOf(ring.poly);
				if (index !== -1) polysAfter.splice(index, 1);
			}
		}
		for (let i = 0, iMax = polysAfter.length; i < iMax; i++) {
			const mp = polysAfter[i].multiPoly;
			if (mpsAfter.indexOf(mp) === -1) mpsAfter.push(mp);
		}
		return this._afterState;
	}
	isInResult() {
		if (this.consumedBy) return false;
		if (this._isInResult !== void 0) return this._isInResult;
		const mpsBefore = this.beforeState().multiPolys;
		const mpsAfter = this.afterState().multiPolys;
		switch (operation_default.type) {
			case "union": {
				const noBefores = mpsBefore.length === 0;
				const noAfters = mpsAfter.length === 0;
				this._isInResult = noBefores !== noAfters;
				break;
			}
			case "intersection": {
				let least;
				let most;
				if (mpsBefore.length < mpsAfter.length) {
					least = mpsBefore.length;
					most = mpsAfter.length;
				} else {
					least = mpsAfter.length;
					most = mpsBefore.length;
				}
				this._isInResult = most === operation_default.numMultiPolys && least < most;
				break;
			}
			case "xor": {
				const diff = Math.abs(mpsBefore.length - mpsAfter.length);
				this._isInResult = diff % 2 === 1;
				break;
			}
			case "difference": {
				const isJustSubject = (mps) => mps.length === 1 && mps[0].isSubject;
				this._isInResult = isJustSubject(mpsBefore) !== isJustSubject(mpsAfter);
				break;
			}
		}
		return this._isInResult;
	}
};
var RingIn = class {
	poly;
	isExterior;
	segments;
	bbox;
	constructor(geomRing, poly, isExterior) {
		if (!Array.isArray(geomRing) || geomRing.length === 0) throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
		this.poly = poly;
		this.isExterior = isExterior;
		this.segments = [];
		if (typeof geomRing[0][0] !== "number" || typeof geomRing[0][1] !== "number") throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
		const firstPoint = precision.snap({
			x: new BigNumber(geomRing[0][0]),
			y: new BigNumber(geomRing[0][1])
		});
		this.bbox = {
			ll: {
				x: firstPoint.x,
				y: firstPoint.y
			},
			ur: {
				x: firstPoint.x,
				y: firstPoint.y
			}
		};
		let prevPoint = firstPoint;
		for (let i = 1, iMax = geomRing.length; i < iMax; i++) {
			if (typeof geomRing[i][0] !== "number" || typeof geomRing[i][1] !== "number") throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
			const point = precision.snap({
				x: new BigNumber(geomRing[i][0]),
				y: new BigNumber(geomRing[i][1])
			});
			if (point.x.eq(prevPoint.x) && point.y.eq(prevPoint.y)) continue;
			this.segments.push(Segment.fromRing(prevPoint, point, this));
			if (point.x.isLessThan(this.bbox.ll.x)) this.bbox.ll.x = point.x;
			if (point.y.isLessThan(this.bbox.ll.y)) this.bbox.ll.y = point.y;
			if (point.x.isGreaterThan(this.bbox.ur.x)) this.bbox.ur.x = point.x;
			if (point.y.isGreaterThan(this.bbox.ur.y)) this.bbox.ur.y = point.y;
			prevPoint = point;
		}
		if (!firstPoint.x.eq(prevPoint.x) || !firstPoint.y.eq(prevPoint.y)) this.segments.push(Segment.fromRing(prevPoint, firstPoint, this));
	}
	getSweepEvents() {
		const sweepEvents = [];
		for (let i = 0, iMax = this.segments.length; i < iMax; i++) {
			const segment = this.segments[i];
			sweepEvents.push(segment.leftSE);
			sweepEvents.push(segment.rightSE);
		}
		return sweepEvents;
	}
};
var PolyIn = class {
	multiPoly;
	exteriorRing;
	interiorRings;
	bbox;
	constructor(geomPoly, multiPoly) {
		if (!Array.isArray(geomPoly)) throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
		this.exteriorRing = new RingIn(geomPoly[0], this, true);
		this.bbox = {
			ll: {
				x: this.exteriorRing.bbox.ll.x,
				y: this.exteriorRing.bbox.ll.y
			},
			ur: {
				x: this.exteriorRing.bbox.ur.x,
				y: this.exteriorRing.bbox.ur.y
			}
		};
		this.interiorRings = [];
		for (let i = 1, iMax = geomPoly.length; i < iMax; i++) {
			const ring = new RingIn(geomPoly[i], this, false);
			if (ring.bbox.ll.x.isLessThan(this.bbox.ll.x)) this.bbox.ll.x = ring.bbox.ll.x;
			if (ring.bbox.ll.y.isLessThan(this.bbox.ll.y)) this.bbox.ll.y = ring.bbox.ll.y;
			if (ring.bbox.ur.x.isGreaterThan(this.bbox.ur.x)) this.bbox.ur.x = ring.bbox.ur.x;
			if (ring.bbox.ur.y.isGreaterThan(this.bbox.ur.y)) this.bbox.ur.y = ring.bbox.ur.y;
			this.interiorRings.push(ring);
		}
		this.multiPoly = multiPoly;
	}
	getSweepEvents() {
		const sweepEvents = this.exteriorRing.getSweepEvents();
		for (let i = 0, iMax = this.interiorRings.length; i < iMax; i++) {
			const ringSweepEvents = this.interiorRings[i].getSweepEvents();
			for (let j = 0, jMax = ringSweepEvents.length; j < jMax; j++) sweepEvents.push(ringSweepEvents[j]);
		}
		return sweepEvents;
	}
};
var MultiPolyIn = class {
	isSubject;
	polys;
	bbox;
	constructor(geom, isSubject) {
		if (!Array.isArray(geom)) throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
		try {
			if (typeof geom[0][0][0] === "number") geom = [geom];
		} catch (ex) {}
		this.polys = [];
		this.bbox = {
			ll: {
				x: new BigNumber(Number.POSITIVE_INFINITY),
				y: new BigNumber(Number.POSITIVE_INFINITY)
			},
			ur: {
				x: new BigNumber(Number.NEGATIVE_INFINITY),
				y: new BigNumber(Number.NEGATIVE_INFINITY)
			}
		};
		for (let i = 0, iMax = geom.length; i < iMax; i++) {
			const poly = new PolyIn(geom[i], this);
			if (poly.bbox.ll.x.isLessThan(this.bbox.ll.x)) this.bbox.ll.x = poly.bbox.ll.x;
			if (poly.bbox.ll.y.isLessThan(this.bbox.ll.y)) this.bbox.ll.y = poly.bbox.ll.y;
			if (poly.bbox.ur.x.isGreaterThan(this.bbox.ur.x)) this.bbox.ur.x = poly.bbox.ur.x;
			if (poly.bbox.ur.y.isGreaterThan(this.bbox.ur.y)) this.bbox.ur.y = poly.bbox.ur.y;
			this.polys.push(poly);
		}
		this.isSubject = isSubject;
	}
	getSweepEvents() {
		const sweepEvents = [];
		for (let i = 0, iMax = this.polys.length; i < iMax; i++) {
			const polySweepEvents = this.polys[i].getSweepEvents();
			for (let j = 0, jMax = polySweepEvents.length; j < jMax; j++) sweepEvents.push(polySweepEvents[j]);
		}
		return sweepEvents;
	}
};
var union = (geom, ...moreGeoms) => operation_default.run("union", geom, moreGeoms);
var difference = (geom, ...moreGeoms) => operation_default.run("difference", geom, moreGeoms);
precision.set;
//#endregion
//#region node_modules/@turf/meta/dist/esm/index.js
function coordEach(geojson, callback, excludeWrapCoord) {
	if (geojson === null) return;
	var j, k, l, geometry, stopG, coords, geometryMaybeCollection, wrapShrink = 0, coordIndex = 0, isGeometryCollection, type = geojson.type, isFeatureCollection = type === "FeatureCollection", isFeature = type === "Feature", stop = isFeatureCollection ? geojson.features.length : 1;
	for (var featureIndex = 0; featureIndex < stop; featureIndex++) {
		geometryMaybeCollection = isFeatureCollection ? geojson.features[featureIndex].geometry : isFeature ? geojson.geometry : geojson;
		isGeometryCollection = geometryMaybeCollection ? geometryMaybeCollection.type === "GeometryCollection" : false;
		stopG = isGeometryCollection ? geometryMaybeCollection.geometries.length : 1;
		for (var geomIndex = 0; geomIndex < stopG; geomIndex++) {
			var multiFeatureIndex = 0;
			var geometryIndex = 0;
			geometry = isGeometryCollection ? geometryMaybeCollection.geometries[geomIndex] : geometryMaybeCollection;
			if (geometry === null) continue;
			coords = geometry.coordinates;
			var geomType = geometry.type;
			wrapShrink = excludeWrapCoord && (geomType === "Polygon" || geomType === "MultiPolygon") ? 1 : 0;
			switch (geomType) {
				case null: break;
				case "Point":
					if (callback(coords, coordIndex, featureIndex, multiFeatureIndex, geometryIndex) === false) return false;
					coordIndex++;
					multiFeatureIndex++;
					break;
				case "LineString":
				case "MultiPoint":
					for (j = 0; j < coords.length; j++) {
						if (callback(coords[j], coordIndex, featureIndex, multiFeatureIndex, geometryIndex) === false) return false;
						coordIndex++;
						if (geomType === "MultiPoint") multiFeatureIndex++;
					}
					if (geomType === "LineString") multiFeatureIndex++;
					break;
				case "Polygon":
				case "MultiLineString":
					for (j = 0; j < coords.length; j++) {
						for (k = 0; k < coords[j].length - wrapShrink; k++) {
							if (callback(coords[j][k], coordIndex, featureIndex, multiFeatureIndex, geometryIndex) === false) return false;
							coordIndex++;
						}
						if (geomType === "MultiLineString") multiFeatureIndex++;
						if (geomType === "Polygon") geometryIndex++;
					}
					if (geomType === "Polygon") multiFeatureIndex++;
					break;
				case "MultiPolygon":
					for (j = 0; j < coords.length; j++) {
						geometryIndex = 0;
						for (k = 0; k < coords[j].length; k++) {
							for (l = 0; l < coords[j][k].length - wrapShrink; l++) {
								if (callback(coords[j][k][l], coordIndex, featureIndex, multiFeatureIndex, geometryIndex) === false) return false;
								coordIndex++;
							}
							geometryIndex++;
						}
						multiFeatureIndex++;
					}
					break;
				case "GeometryCollection":
					for (j = 0; j < geometry.geometries.length; j++) if (coordEach(geometry.geometries[j], callback, excludeWrapCoord) === false) return false;
					break;
				default: throw new Error("Unknown Geometry Type");
			}
		}
	}
}
function geomEach(geojson, callback) {
	var i, j, g, geometry, stopG, geometryMaybeCollection, isGeometryCollection, featureProperties, featureBBox, featureId, featureIndex = 0, isFeatureCollection = geojson.type === "FeatureCollection", isFeature = geojson.type === "Feature", stop = isFeatureCollection ? geojson.features.length : 1;
	for (i = 0; i < stop; i++) {
		geometryMaybeCollection = isFeatureCollection ? geojson.features[i].geometry : isFeature ? geojson.geometry : geojson;
		featureProperties = isFeatureCollection ? geojson.features[i].properties : isFeature ? geojson.properties : {};
		featureBBox = isFeatureCollection ? geojson.features[i].bbox : isFeature ? geojson.bbox : void 0;
		featureId = isFeatureCollection ? geojson.features[i].id : isFeature ? geojson.id : void 0;
		isGeometryCollection = geometryMaybeCollection ? geometryMaybeCollection.type === "GeometryCollection" : false;
		stopG = isGeometryCollection ? geometryMaybeCollection.geometries.length : 1;
		for (g = 0; g < stopG; g++) {
			geometry = isGeometryCollection ? geometryMaybeCollection.geometries[g] : geometryMaybeCollection;
			if (geometry === null) {
				if (callback(null, featureIndex, featureProperties, featureBBox, featureId) === false) return false;
				continue;
			}
			switch (geometry.type) {
				case "Point":
				case "LineString":
				case "MultiPoint":
				case "Polygon":
				case "MultiLineString":
				case "MultiPolygon":
					if (callback(geometry, featureIndex, featureProperties, featureBBox, featureId) === false) return false;
					break;
				case "GeometryCollection":
					for (j = 0; j < geometry.geometries.length; j++) if (callback(geometry.geometries[j], featureIndex, featureProperties, featureBBox, featureId) === false) return false;
					break;
				default: throw new Error("Unknown Geometry Type");
			}
		}
		featureIndex++;
	}
}
function flattenEach(geojson, callback) {
	geomEach(geojson, function(geometry, featureIndex, properties, bbox, id) {
		var type = geometry === null ? null : geometry.type;
		switch (type) {
			case null:
			case "Point":
			case "LineString":
			case "Polygon":
				if (callback(feature(geometry, properties, {
					bbox,
					id
				}), featureIndex, 0) === false) return false;
				return;
		}
		var geomType;
		switch (type) {
			case "MultiPoint":
				geomType = "Point";
				break;
			case "MultiLineString":
				geomType = "LineString";
				break;
			case "MultiPolygon":
				geomType = "Polygon";
				break;
		}
		for (var multiFeatureIndex = 0; multiFeatureIndex < geometry.coordinates.length; multiFeatureIndex++) {
			var coordinate = geometry.coordinates[multiFeatureIndex];
			if (callback(feature({
				type: geomType,
				coordinates: coordinate
			}, properties), featureIndex, multiFeatureIndex) === false) return false;
		}
	});
}
//#endregion
//#region node_modules/@turf/union/dist/esm/index.js
function union2(features, options = {}) {
	const geoms = [];
	geomEach(features, (geom) => {
		geoms.push(geom.coordinates);
	});
	if (geoms.length < 2) throw new Error("Must have at least 2 geometries");
	const unioned = union(geoms[0], ...geoms.slice(1));
	if (unioned.length === 0) return null;
	if (unioned.length === 1) return polygon(unioned[0], options.properties);
	else return multiPolygon(unioned, options.properties);
}
var index_default$3 = union2;
//#endregion
//#region node_modules/@turf/bbox/dist/esm/index.js
var import_maplibre_gl = /* @__PURE__ */ __toESM(require_maplibre_gl(), 1);
function bbox(geojson, options = {}) {
	if (geojson.bbox != null && true !== options.recompute) return geojson.bbox;
	const result = [
		Infinity,
		Infinity,
		-Infinity,
		-Infinity
	];
	coordEach(geojson, (coord) => {
		if (result[0] > coord[0]) result[0] = coord[0];
		if (result[1] > coord[1]) result[1] = coord[1];
		if (result[2] < coord[0]) result[2] = coord[0];
		if (result[3] < coord[1]) result[3] = coord[1];
	});
	return result;
}
var index_default$2 = bbox;
//#endregion
//#region node_modules/@turf/difference/dist/esm/index.js
function difference2(features) {
	const geoms = [];
	geomEach(features, (geom) => {
		geoms.push(geom.coordinates);
	});
	if (geoms.length < 2) throw new Error("Must have at least two features");
	const properties = features.features[0].properties || {};
	const differenced = difference(geoms[0], ...geoms.slice(1));
	if (differenced.length === 0) return null;
	if (differenced.length === 1) return polygon(differenced[0], properties);
	return multiPolygon(differenced, properties);
}
var index_default$1 = difference2;
//#endregion
//#region node_modules/@turf/flatten/dist/esm/index.js
function flatten(geojson) {
	if (!geojson) throw new Error("geojson is required");
	var results = [];
	flattenEach(geojson, function(feature) {
		results.push(feature);
	});
	return featureCollection(results);
}
var index_default = flatten;
//#endregion
//#region node_modules/@maptiler/geocoding-control/dist/maptilersdk.js
var Je = Object.getOwnPropertyDescriptor, Xe = (t, e, i, a) => {
	for (var s = a > 1 ? void 0 : a ? Je(e, i) : e, o = t.length - 1, r; o >= 0; o--) (r = t[o]) && (s = r(s) || s);
	return s;
};
var X = class extends LitElement {
	render() {
		return svg`
      <svg viewBox="0 0 14 14" width="13" height="13">
        <path
          d="M13.12.706a.982.982 0 0 0-1.391 0L6.907 5.517 2.087.696a.982.982 0 1 0-1.391 1.39l4.821 4.821L.696 11.73a.982.982 0 1 0 1.39 1.39l4.821-4.821 4.822 4.821a.982.982 0 1 0 1.39-1.39L8.298 6.908l4.821-4.822a.988.988 0 0 0 0-1.38Z"
        />
      </svg>
    `;
	}
};
X.styles = css`
    svg {
      display: block;
      fill: var(--color-icon-button);
    }
  `;
X = Xe([customElement("maptiler-geocode-clear-icon")], X);
var et = Object.getOwnPropertyDescriptor, tt = (t, e, i, a) => {
	for (var s = a > 1 ? void 0 : a ? et(e, i) : e, o = t.length - 1, r; o >= 0; o--) (r = t[o]) && (s = r(s) || s);
	return s;
};
var ee = class extends LitElement {
	render() {
		return svg`
      <svg viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M15 0C6.705 0 0 6.705 0 15C0 23.295 6.705 30 15 30C23.295 30 30 23.295 30 15C30 6.705 23.295 0 15 0ZM22.5 20.385L20.385 22.5L15 17.115L9.615 22.5L7.5 20.385L12.885 15L7.5 9.615L9.615 7.5L15 12.885L20.385 7.5L22.5 9.615L17.115 15L22.5 20.385Z"
        />
      </svg>
    `;
	}
};
ee.styles = css`
    svg {
      display: block;
      fill: #e15042;
    }
  `;
ee = tt([customElement("maptiler-geocode-fail-icon")], ee);
var it = Object.getOwnPropertyDescriptor, st = (t, e, i, a) => {
	for (var s = a > 1 ? void 0 : a ? it(e, i) : e, o = t.length - 1, r; o >= 0; o--) (r = t[o]) && (s = r(s) || s);
	return s;
};
var te = class extends LitElement {
	render() {
		return html`
      <div>
        <svg viewBox="0 0 18 18" width="24" height="24" class="loading-icon">
          <path fill="#333" d="M4.4 4.4l.8.8c2.1-2.1 5.5-2.1 7.6 0l.8-.8c-2.5-2.5-6.7-2.5-9.2 0z" />
          <path opacity=".1" d="M12.8 12.9c-2.1 2.1-5.5 2.1-7.6 0-2.1-2.1-2.1-5.5 0-7.7l-.8-.8c-2.5 2.5-2.5 6.7 0 9.2s6.6 2.5 9.2 0 2.5-6.6 0-9.2l-.8.8c2.2 2.1 2.2 5.6 0 7.7z" />
        </svg>
      </div>
    `;
	}
};
te.styles = css`
    div {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;

      display: flex;
      align-items: center;
    }

    .loading-icon {
      animation: rotate 0.8s infinite cubic-bezier(0.45, 0.05, 0.55, 0.95);
    }

    @keyframes rotate {
      from {
        -webkit-transform: rotate(0);
        transform: rotate(0);
      }
      to {
        -webkit-transform: rotate(360deg);
        transform: rotate(360deg);
      }
    }
  `;
te = st([customElement("maptiler-geocode-loading-icon")], te);
var rt = Object.getOwnPropertyDescriptor, ot = (t, e, i, a) => {
	for (var s = a > 1 ? void 0 : a ? rt(e, i) : e, o = t.length - 1, r; o >= 0; o--) (r = t[o]) && (s = r(s) || s);
	return s;
};
var ie = class extends LitElement {
	render() {
		return svg`
      <svg viewBox="0 0 60.006 21.412" width="14" height="20">
        <path
          d="M30.003-26.765C13.46-26.765 0-14.158 0 1.337c0 23.286 24.535 42.952 28.39 46.04.24.192.402.316.471.376.323.282.732.424 1.142.424.41 0 .82-.142 1.142-.424.068-.06.231-.183.471-.376 3.856-3.09 28.39-22.754 28.39-46.04 0-15.495-13.46-28.102-30.003-28.102Zm1.757 12.469c4.38 0 7.858 1.052 10.431 3.158 2.595 2.105 3.89 4.913 3.89 8.422 0 2.34-.53 4.362-1.593 6.063-1.063 1.702-3.086 3.616-6.063 5.742-2.042 1.51-3.337 2.659-3.89 3.446-.532.787-.8 1.82-.8 3.096v1.914h-8.449V15.18c0-2.041.434-3.815 1.306-5.325.872-1.51 2.467-3.118 4.785-4.82 2.233-1.594 3.7-2.89 4.402-3.889a5.582 5.582 0 0 0 1.087-3.35c0-1.382-.51-2.435-1.531-3.158-1.02-.723-2.45-1.087-4.28-1.087-3.19 0-6.826 1.047-10.91 3.131l-3.472-6.986c4.742-2.659 9.77-3.992 15.087-3.992Zm-1.88 37.324c1.765 0 3.124.472 4.08 1.408.98.936 1.47 2.276 1.47 4.02 0 1.68-.49 3.007-1.47 3.985-.977.957-2.336 1.435-4.08 1.435-1.787 0-3.171-.465-4.15-1.4-.978-.958-1.47-2.298-1.47-4.02 0-1.787.48-3.14 1.436-4.054.957-.915 2.355-1.374 4.184-1.374Z"
        />
      </svg>
    `;
	}
};
ie.styles = css`
    svg {
      display: block;
      fill: var(--color-icon-button);
    }
  `;
ie = ot([customElement("maptiler-geocode-reverse-geocoding-icon")], ie);
var at = Object.getOwnPropertyDescriptor, lt = (t, e, i, a) => {
	for (var s = a > 1 ? void 0 : a ? at(e, i) : e, o = t.length - 1, r; o >= 0; o--) (r = t[o]) && (s = r(s) || s);
	return s;
};
var se = class extends LitElement {
	render() {
		return svg`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="13"
        height="13"
        viewBox="0 0 13 13"
      >
        <circle cx="4.789" cy="4.787" r="3.85" />
        <path d="M12.063 12.063 7.635 7.635" />
      </svg>
    `;
	}
};
se.styles = css`
    circle {
      stroke-width: 1.875;
      fill: none;
    }

    path {
      stroke-width: 1.875;
      stroke-linecap: round;
    }

    svg {
      display: block;
      stroke: var(--color-icon-button);
    }
  `;
se = lt([customElement("maptiler-geocode-search-icon")], se);
function nt(t, e, i) {
	const a = e[1], s = e[0], o = a - s;
	return t === a && i ? t : ((t - s) % o + o) % o + s;
}
function V(t) {
	const e = [...t];
	return e[2] < e[0] && (Math.abs((e[0] + e[2] + 360) / 2) > Math.abs((e[0] - 360 + e[2]) / 2) ? e[0] -= 360 : e[2] += 360), e;
}
var P;
async function ct(t, e, i) {
	for (const a of e ?? []) if (!(t && (a.minZoom != null && a.minZoom > t[0] || a.maxZoom != null && a.maxZoom < t[0]))) {
		if (a.type === "fixed") return a.coordinates.join(",");
		if (a.type === "client-geolocation") if (P && a.cachedLocationExpiry && P.time + a.cachedLocationExpiry > Date.now()) {
			if (P.coords) return P.coords;
		} else {
			let s;
			try {
				return s = await new Promise((o, r) => {
					i.signal.addEventListener("abort", () => {
						r(Error("aborted"));
					}), navigator.geolocation.getCurrentPosition((u) => {
						o([u.coords.longitude, u.coords.latitude].map((y) => y.toFixed(6)).join(","));
					}, (u) => {
						r(u);
					}, a);
				}), s;
			} catch {} finally {
				a.cachedLocationExpiry && (P = {
					time: Date.now(),
					coords: s
				});
			}
			if (i.signal.aborted) return;
		}
		if (a.type === "server-geolocation") return "ip";
		if (t && a.type === "map-center") return t[1].toFixed(6) + "," + t[2].toFixed(6);
	}
}
var ht = ".sprite-icon{align-self:center;justify-self:center;opacity:.75;background-repeat:no-repeat}li{text-align:left;cursor:default;display:grid;grid-template-columns:40px 1fr;color:var(--color-text);padding:8px 0;font-size:14px;line-height:18px;min-width:fit-content;outline:0}li:first-child{padding-top:10px}li:last-child{padding-bottom:10px}li.picked{background-color:#e7edff}li.picked .secondary{color:#96a4c7;padding-left:4px}li.picked .line2{color:#96a4c7}li.selected{background-color:#f3f6ff;animation:backAndForth 5s linear infinite}li.selected .primary{color:#2b8bfb}li.selected .secondary{color:#a2adc7;padding-left:4px}li.selected .line2{color:#a2adc7}li>img{align-self:center;justify-self:center;opacity:.75}.texts{padding:0 17px 0 0}.texts>*{white-space:nowrap;display:block;min-width:fit-content}.primary{font-weight:600}.secondary{color:#aeb6c7;padding-left:4px}.line2{color:#aeb6c7}@keyframes backAndForth{0%{transform:translate(0)}10%{transform:translate(0)}45%{transform:translate(calc(-100% + 270px))}55%{transform:translate(calc(-100% + 270px))}90%{transform:translate(0)}to{transform:translate(0)}}";
var pt = Object.defineProperty, dt = Object.getOwnPropertyDescriptor, $e = (t) => {
	throw TypeError(t);
}, L = (t, e, i, a) => {
	for (var s = a > 1 ? void 0 : a ? dt(e, i) : e, o = t.length - 1, r; o >= 0; o--) (r = t[o]) && (s = (a ? r(e, i, s) : r(s)) || s);
	return a && s && pt(e, i, s), s;
}, Ie = (t, e, i) => e.has(t) || $e("Cannot " + i), f = (t, e, i) => (Ie(t, e, "read from private field"), i ? i.call(t) : e.get(t)), ut = (t, e, i) => e.has(t) ? $e("Cannot add the same private member more than once") : e instanceof WeakSet ? e.add(t) : e.set(t, i), C = (t, e, i) => (Ie(t, e, "access private method"), i), d, q, G, g, Fe, Oe, he, re;
var Me = typeof devicePixelRatio > "u" || devicePixelRatio > 1.25, Te = Me ? "@2x" : "", S = Me ? 2 : 1;
var T, Se, k = class extends LitElement {
	constructor() {
		super(...arguments), ut(this, d), this.itemStyle = "default", this.showPlaceType = "if-needed", this.missingIconsCache = /* @__PURE__ */ new Set(), this.iconsBaseUrl = "", this.index = 0;
	}
	willUpdate(t) {
		t.has("feature") && f(this, d, q) && (this.index = f(this, d, q).length, C(this, d, he).call(this));
	}
	render() {
		return html`
      <li
        tabindex="-1"
        role="option"
        aria-selected=${this.itemStyle === "selected"}
        aria-checked=${this.itemStyle === "picked"}
        class=${this.itemStyle}
        @click=${() => this.dispatchEvent(new CustomEvent("select"))}
      >
        ${T && this.spriteIcon ? html`
              <div
                class="sprite-icon"
                style=${styleMap({
			width: `${this.spriteIcon.width / S}px`,
			height: `${this.spriteIcon.height / S}px`,
			backgroundImage: `url(${this.iconsBaseUrl}sprite${Te}.png)`,
			backgroundPosition: `-${this.spriteIcon.x / S}px -${this.spriteIcon.y / S}px`,
			backgroundSize: `${T.width / S}px ${T.height / S}px`
		})}
                title=${f(this, d, g)}
              />
            ` : this.imageUrl ? html` <img src=${this.imageUrl} alt=${this.category} title=${f(this, d, g)} @error=${C(this, d, Oe)} />` : this.feature?.address ? html` <img src=${this.iconsBaseUrl + "housenumber.svg"} alt=${f(this, d, g)} title=${f(this, d, g)} /> ` : this.feature?.id.startsWith("road.") ? html` <img src=${this.iconsBaseUrl + "road.svg"} alt=${f(this, d, g)} title=${f(this, d, g)} /> ` : this.feature?.id.startsWith("address.") ? html` <img src=${this.iconsBaseUrl + "street.svg"} alt=${f(this, d, g)} title=${f(this, d, g)} /> ` : this.feature?.id.startsWith("postal_code.") ? html` <img src=${this.iconsBaseUrl + "postal_code.svg"} alt=${f(this, d, g)} title=${f(this, d, g)} /> ` : this.feature?.id.startsWith("poi.") ? html` <img src=${this.iconsBaseUrl + "poi.svg"} alt=${f(this, d, g)} title=${f(this, d, g)} /> ` : f(this, d, G) ? html` <img src=${this.iconsBaseUrl + "reverse.svg"} alt=${f(this, d, g)} title=${f(this, d, g)} /> ` : html` <img src=${this.iconsBaseUrl + "area.svg"} alt=${f(this, d, g)} title=${f(this, d, g)} /> `}

        <span class="texts">
          <span>
            <span class="primary"> ${f(this, d, G) ? this.feature?.place_name : this.feature?.place_name.replace(/,.*/, "")} </span>

            ${this.showPlaceType === "always" || this.showPlaceType !== "never" && !this.feature?.address && !this.feature?.id.startsWith("road.") && !this.feature?.id.startsWith("address.") && !this.feature?.id.startsWith("postal_code.") && (!this.feature?.id.startsWith("poi.") || !this.imageUrl) && !f(this, d, G) ? html` <span class="secondary"> ${f(this, d, g)} </span> ` : nothing}
          </span>

          <span class="line2"> ${f(this, d, G) ? this.feature?.text : this.feature?.place_name.replace(/[^,]*,?s*/, "")} </span>
        </span>
      </li>
    `;
	}
};
d = /* @__PURE__ */ new WeakSet();
q = function() {
	return this.feature?.properties?.categories;
};
G = function() {
	return this.feature?.place_type[0] === "reverse";
};
g = function() {
	return this.feature?.properties?.categories?.join(", ") ?? this.feature?.place_type_name?.[0] ?? this.feature?.place_type[0];
};
Fe = function() {
	Se ??= fetch(`${this.iconsBaseUrl}sprite${Te}.json`).then((t) => t.json()).then((t) => {
		T = t;
	}).catch(() => {
		T = null;
	});
};
Oe = function() {
	this.imageUrl && this.missingIconsCache.add(this.imageUrl), C(this, d, he).call(this);
};
he = function() {
	T !== void 0 ? C(this, d, re).call(this) : (C(this, d, Fe).call(this), Se?.then(() => {
		C(this, d, re).call(this);
	}));
};
re = function() {
	do {
		if (this.index--, this.category = f(this, d, q)?.[this.index], this.spriteIcon = this.category ? T?.icons[this.category] : void 0, this.spriteIcon) break;
		this.imageUrl = this.category ? this.iconsBaseUrl + this.category.replace(/ /g, "_") + ".svg" : void 0;
	} while (this.index > -1 && (!this.imageUrl || this.missingIconsCache.has(this.imageUrl)));
};
k.styles = css`
    ${unsafeCSS(ht)}
  `;
L([property({ type: Object })], k.prototype, "feature", 2);
L([property({ type: String })], k.prototype, "itemStyle", 2);
L([property({ type: String })], k.prototype, "showPlaceType", 2);
L([property({ attribute: !1 })], k.prototype, "missingIconsCache", 2);
L([property({ type: String })], k.prototype, "iconsBaseUrl", 2);
L([state()], k.prototype, "category", 2);
L([state()], k.prototype, "imageUrl", 2);
L([state()], k.prototype, "spriteIcon", 2);
L([state()], k.prototype, "index", 2);
k = L([customElement("maptiler-geocoder-feature-item")], k);
var ft = "form{font-family:Open Sans,Ubuntu,Helvetica Neue,Arial,Helvetica,sans-serif;position:relative;background-color:#fff;z-index:10;border-radius:4px;margin:0;transition:max-width .25s;box-shadow:0 2px 5px #33335926;--color-text: #444952;--color-icon-button: #444952;pointer-events:all}form,form *,form *:after,form *:before{box-sizing:border-box}form.can-collapse{max-width:29px}form.can-collapse input::placeholder{transition:opacity .25s;opacity:0}form{width:270px;max-width:270px}form:focus-within,form:hover{width:270px;max-width:270px}form input::placeholder,form:focus-within input::placeholder,form:hover input::placeholder{opacity:1}input{font:inherit;font-size:14px;flex-grow:1;min-height:29px;background-color:transparent;color:#444952;white-space:nowrap;overflow:hidden;border:0;margin:0;padding:0}input:focus{color:#444952;outline:0;outline:none;box-shadow:none}ul,div.error,div.no-results{background-color:#fff;border-radius:4px;left:0;list-style:none;margin:0;padding:0;position:absolute;width:100%;top:calc(100% + 6px);overflow:hidden}ul{font-size:14px;line-height:16px;box-shadow:0 5px 10px #33335926}div.error,div.no-results{font:inherit;line-height:18px;font-size:12px;display:flex;gap:16px}div.error{padding:16px;font-weight:600;color:#e25041;background-color:#fbeae8}div.error div{flex-grow:1}div.error maptiler-geocode-fail-icon{flex-shrink:0;width:20px;height:20px}div.error button{flex-shrink:0}div.error button maptiler-geocode-clear-icon{--color-icon-button: #e25041}div.error button:hover maptiler-geocode-clear-icon,div.error button:active maptiler-geocode-clear-icon{--color-icon-button: inherit}div.no-results{padding:14px 24px 14px 16px;font-weight:400;color:#6b7c93;box-shadow:0 5px 10px #33335926}div.no-results maptiler-geocode-fail-icon{margin-top:4px;flex-shrink:0;width:20px;height:20px}ul.options.open-on-top{top:auto;bottom:calc(100% + 6px)}button{padding:0;margin:0;border:0;background-color:transparent;height:auto;width:auto}button:hover{background-color:transparent}button:hover,button:active{--color-icon-button: #2b8bfb}.input-group{display:flex;align-items:stretch;gap:7px;padding-inline:8px;border-radius:4px;overflow:hidden}.input-group:focus-within{outline:#2b8bfb solid 2px}.search-button{flex-shrink:0}.clear-button-container{display:flex;display:none;position:relative;align-items:stretch}.clear-button-container.displayable{display:flex;flex-shrink:0}:host(.maptiler-geocoder):not(:empty){box-shadow:none}:host(.maptiler-geocoder) .input-group{border:white solid 2px}:host(.maptiler-geocoder) .input-group:focus-within{border:#2b8bfb solid 2px;outline:0;outline:none}:host(.maptiler-geocoder) form.can-collapse{max-width:33px}:host(.maptiler-geocoder) form,:host(.maptiler-geocoder) form:focus-within,:host(.maptiler-geocoder) form:hover{width:270px;max-width:270px}:host(.leaflet-geocoder) .input-group{border:white solid 1px}:host(.leaflet-geocoder) form.can-collapse{max-width:30px}";
var mt = Object.defineProperty, gt = Object.getOwnPropertyDescriptor, Ce = (t) => {
	throw TypeError(t);
}, c = (t, e, i, a) => {
	for (var s = a > 1 ? void 0 : a ? gt(e, i) : e, o = t.length - 1, r; o >= 0; o--) (r = t[o]) && (s = (a ? r(e, i, s) : r(s)) || s);
	return a && s && mt(e, i, s), s;
}, pe = (t, e, i) => e.has(t) || Ce("Cannot " + i), w = (t, e, i) => (pe(t, e, "read from private field"), i ? i.call(t) : e.get(t)), U = (t, e, i) => e.has(t) ? Ce("Cannot add the same private member more than once") : e instanceof WeakSet ? e.add(t) : e.set(t, i), oe = (t, e, i, a) => (pe(t, e, "write to private field"), e.set(t, i), i), h = (t, e, i) => (pe(t, e, "access private method"), i), N, B, ae, R, l, Z, Ee, de, x, ue, K, fe, me, $, ge, Q, Pe, le, Ue, Ge, Be, Re, ze, je, Ae;
var n = class extends LitElement {
	constructor() {
		super(...arguments), U(this, l), this.clearListOnPick = !1, this.clearOnBlur = !1, this.collapsed = !1, this.excludeTypes = !1, this.exhaustiveReverseGeocoding = !1, this.fetchFullGeometryOnPick = !1, this.keepListOpen = !1, this.openListOnTop = !1, this.reverseActive = !1, this.searchValue = "", this.selectedItemIndex = -1, this.cachedFeatures = [], this.lastSearchUrl = "", this.focused = !1, this.isFeatureListVisible = !1, this.isFeatureListInteractedWith = !1, U(this, N, !1), U(this, B), U(this, ae, /* @__PURE__ */ new Set()), U(this, R);
	}
	firstUpdated() {
		oe(this, N, !0);
	}
	/**
	* Set the options of this instance.
	*
	* @param options options to set
	*/
	setOptions(t) {
		const e = { ...t };
		for (const i of Object.keys(e)) yt.includes(i) || delete e[i];
		Object.assign(this, e);
	}
	/**
	* Set the content of search input box.
	*
	* @param value text to set
	*/
	setQuery(t) {
		h(this, l, me).call(this, t, { external: !0 }), h(this, l, fe).call(this);
	}
	/**
	* Set the content of search input box and immediately submit it.
	*
	* @param value text to set and submit
	*/
	submitQuery(t) {
		h(this, l, ge).call(this, t, { external: !0 });
	}
	/**
	* Clear search result list.
	*/
	clearList() {
		h(this, l, $).call(this), this.picked = void 0, this.selectedItemIndex = -1;
	}
	/**
	* Focus the search input box.
	*
	* @param options [FocusOptions](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus#options)
	*/
	focus(t) {
		this.input.focus(t);
	}
	/**
	* Blur the search input box.
	*/
	blur() {
		this.input.blur();
	}
	addEventListener(t, e, i) {
		super.addEventListener(t, e, i);
	}
	removeEventListener(t, e, i) {
		super.removeEventListener(t, e, i);
	}
	/** @internal */
	handleMapChange(t) {
		oe(this, R, t);
	}
	/** @internal */
	handleMapClick(t) {
		this.reverseActive && h(this, l, Pe).call(this, t);
	}
	willUpdate(t) {
		t.has("error") && this.error && console.error("[MapTilerGeocodingControl] Error:", this.error), t.has("enableReverse") && (this.reverseActive = this.enableReverse === "always"), ["picked"].some((e) => t.has(e)) && this.picked && (this.clearListOnPick && h(this, l, $).call(this), this.selectedItemIndex = -1), ["searchValue", "minLength"].some((e) => t.has(e)) && w(this, l, de) && (h(this, l, $).call(this), this.error = void 0), ["focused", "listIsInteractedWith"].some((e) => t.has(e)) && this.clearOnBlur && !this.focused && !this.isFeatureListInteractedWith && (this.searchValue = ""), [
			"selectFirst",
			"listFeatures",
			"selectedItemIndex",
			"picked"
		].some((e) => t.has(e)) && this.selectFirst !== !1 && this.listFeatures?.length && this.selectedItemIndex == -1 && !this.picked && (this.selectedItemIndex = 0), ["listFeatures", "selectedItemIndex"].some((e) => t.has(e)) && h(this, l, x).call(this, "select", { feature: w(this, l, Z) }), ["picked"].some((e) => t.has(e)) && this.picked && this.picked.id !== t.get("picked")?.id && (this.fetchFullGeometryOnPick && !this.picked.address && this.picked.geometry.type === "Point" && this.picked.place_type[0] !== "reverse" ? h(this, l, Q).call(this, this.picked.id, { byId: !0 }) : Promise.resolve()).then(() => {
			h(this, l, x).call(this, "pick", { feature: this.picked });
		}, (e) => {
			e && typeof e == "object" && "name" in e && e.name === "AbortError" || (this.error = e, h(this, l, x).call(this, "pick", { feature: this.picked }));
		}), [
			"listFeatures",
			"focused",
			"isFeatureListInteractedWith",
			"keepListOpen"
		].some((e) => t.has(e)) && (this.isFeatureListVisible = !!this.listFeatures?.length && (this.focused || this.isFeatureListInteractedWith || this.keepListOpen)), ["isFeatureListVisible"].some((e) => t.has(e)) && (this.isFeatureListVisible ? h(this, l, x).call(this, "featuresshow") : h(this, l, x).call(this, "featureshide")), ["reverseActive"].some((e) => t.has(e)) && h(this, l, x).call(this, "reversetoggle", { reverse: this.reverseActive });
	}
	render() {
		return html`
      <form @submit=${h(this, l, ue)} class=${classMap({ "can-collapse": this.collapsed && this.searchValue === "" })}>
        <div class="input-group">
          <button
            class="search-button"
            type="button"
            @click=${() => {
			this.input.focus();
		}}
          >
            <maptiler-geocode-search-icon></maptiler-geocode-search-icon>
          </button>

          <input
            .value=${this.searchValue}
            @focus=${() => this.focused = !0}
            @blur=${() => this.focused = !1}
            @click=${() => this.focused = !0}
            @keydown=${h(this, l, le)}
            @input=${h(this, l, Ue)}
            @change=${() => this.picked = void 0}
            placeholder=${this.placeholder ?? "Search"}
            aria-label=${this.placeholder ?? "Search"}
          />

          <div class="clear-button-container ${classMap({ displayable: this.searchValue !== "" })}">
            ${w(this, l, Ee) ? html`<maptiler-geocode-loading-icon></maptiler-geocode-loading-icon>` : html`
                  <button type="button" @click=${h(this, l, Ae)} title=${this.clearButtonTitle ?? "clear"}>
                    <maptiler-geocode-clear-icon></maptiler-geocode-clear-icon>
                  </button>
                `}
          </div>

          ${this.enableReverse === "button" ? html`
                <button
                  type="button"
                  class=${classMap({ active: this.reverseActive })}
                  title=${this.reverseButtonTitle ?? "toggle reverse geocoding"}
                  @click=${() => this.reverseActive = !this.reverseActive}
                >
                  <maptiler-geocode-reverse-geocoding-icon></maptiler-geocode-reverse-geocoding-icon>
                </button>
              ` : nothing}

          <!-- <slot /> -->
        </div>

        ${this.error ? html`
              <div class="error">
                <maptiler-geocode-fail-icon></maptiler-geocode-fail-icon>

                <div>${this.errorMessage ?? "Something went wrong…"}</div>

                <button @click=${() => this.error = void 0}>
                  <maptiler-geocode-clear-icon></maptiler-geocode-clear-icon>
                </button>
              </div>
            ` : !this.focused && !this.isFeatureListInteractedWith && !this.keepListOpen || this.listFeatures === void 0 ? nothing : this.listFeatures.length === 0 ? html`
                  <div class="no-results">
                    <maptiler-geocode-fail-icon></maptiler-geocode-fail-icon>

                    <div>
                      ${this.noResultsMessage ?? "Oops! Looks like you're trying to predict something that's not quite right. We can't seem to find what you're looking for. Maybe try double-checking your spelling or try a different search term. Keep on typing - we'll do our best to get you where you need to go!"}
                    </div>
                  </div>
                ` : html`
                  <ul
                    class="options ${classMap({ "open-on-top": this.openListOnTop })}"
                    @pointerleave=${h(this, l, Re)}
                    @pointerdown=${h(this, l, ze)}
                    @pointerup=${h(this, l, je)}
                    @keydown=${h(this, l, le)}
                    role="listbox"
                  >
                    ${repeat(this.listFeatures, (t) => t.id + (t.address ? "," + t.address : ""), (t, e) => html`
                        <maptiler-geocoder-feature-item
                          .feature=${t}
                          .showPlaceType=${this.showPlaceType ?? "if-needed"}
                          itemStyle=${this.selectedItemIndex === e ? "selected" : this.picked?.id === t.id ? "picked" : "default"}
                          @pointerenter=${() => {
			h(this, l, Be).call(this, e);
		}}
                          @select=${() => {
			h(this, l, Ge).call(this, t);
		}}
                          .missingIconsCache=${w(this, ae)}
                          .iconsBaseUrl=${this.iconsBaseUrl ?? "https://cdn.maptiler.com/maptiler-geocoding-control/v3.0.0/icons/"}
                        />
                      `)}
                  </ul>
                `}
      </form>
    `;
	}
};
N = /* @__PURE__ */ new WeakMap();
B = /* @__PURE__ */ new WeakMap();
ae = /* @__PURE__ */ new WeakMap();
R = /* @__PURE__ */ new WeakMap();
l = /* @__PURE__ */ new WeakSet();
Z = function() {
	return this.listFeatures?.[this.selectedItemIndex];
};
Ee = function() {
	return this.abortController !== void 0;
};
de = function() {
	return this.searchValue.length < (this.minLength ?? 2);
};
x = function(t, ...[e]) {
	w(this, N) && this.dispatchEvent(new CustomEvent(t, {
		bubbles: !0,
		composed: !0,
		detail: e
	}));
};
ue = function(t, { external: e = !1 } = {}) {
	t?.preventDefault(), this.focused = !1, clearTimeout(w(this, B)), this.selectedItemIndex > -1 && this.listFeatures ? (this.picked = this.listFeatures[this.selectedItemIndex], this.searchValue = this.picked.place_type[0] === "reverse" ? this.picked.place_name : this.picked.place_name.replace(/,.*/, ""), this.error = void 0, this.selectedItemIndex = -1) : this.searchValue && h(this, l, Q).call(this, this.searchValue, {
		exact: !0,
		external: e
	}).then(() => {
		this.picked = void 0;
	}).catch((i) => this.error = i);
};
K = function(t) {
	try {
		return convert(t, 6);
	} catch {
		return !1;
	}
};
fe = function() {
	setTimeout(() => {
		this.input.focus(), this.focused = !0, this.input.select();
	});
};
me = function(t, { external: e = !1 } = {}) {
	if (this.searchValue = t, h(this, l, x).call(this, "querychange", {
		query: this.searchValue,
		reverseCoords: h(this, l, K).call(this, t)
	}), this.error = void 0, this.picked = void 0, this.showResultsWhileTyping !== !1) {
		if (clearTimeout(w(this, B)), w(this, l, de)) return;
		const i = this.searchValue;
		oe(this, B, window.setTimeout(() => {
			h(this, l, Q).call(this, i, { external: e }).catch((a) => this.error = a);
		}, this.debounceSearch ?? 200));
	} else h(this, l, $).call(this);
};
$ = function() {
	this.listFeatures !== void 0 && (this.listFeatures = void 0, h(this, l, x).call(this, "featuresclear"));
};
ge = function(t, { external: e = !1 } = {}) {
	this.searchValue = t, h(this, l, x).call(this, "querychange", {
		query: this.searchValue,
		reverseCoords: h(this, l, K).call(this, t)
	}), this.selectedItemIndex = -1, h(this, l, ue).call(this, void 0, { external: e });
};
Q = async function(t, { byId: e = !1, exact: i = !1, external: a = !1 } = {}) {
	this.error = void 0, this.abortController?.abort();
	const s = new AbortController();
	this.abortController = s;
	try {
		const o = this.apiUrl ?? "https://api.maptiler.com/geocoding", r = h(this, l, K).call(this, t), u = new URL(o + "/" + encodeURIComponent(r ? `${r.decimalLongitude},${r.decimalLatitude}` : t) + ".json"), y = u.searchParams;
		this.language !== void 0 && y.set("language", Array.isArray(this.language) ? this.language.join(",") : this.language ?? "");
		const [M] = w(this, R) ?? [void 0];
		let _ = (!r || this.reverseGeocodingTypes === void 0 ? this.types : this.reverseGeocodingTypes)?.map((v) => typeof v == "string" ? v : M === void 0 || (v[0] ?? 0) <= M && M < (v[1] ?? Infinity) ? v[2] : void 0).filter((v) => v !== void 0);
		_ && (_ = [...new Set(_)], y.set("types", _.join(",")));
		const ye = !r || this.reverseGeocodingExcludeTypes === void 0 ? this.excludeTypes : this.reverseGeocodingExcludeTypes;
		if (ye && y.set("excludeTypes", String(ye)), this.bbox && y.set("bbox", this.bbox.map((v) => v.toFixed(6)).join(",")), this.country && y.set("country", Array.isArray(this.country) ? this.country.join(",") : this.country), this.worldview && y.set("worldview", this.worldview), !e && !r) {
			const v = this.proximity ?? [{ type: "server-geolocation" }], xe = await ct(w(this, R), v, s);
			xe && y.set("proximity", xe), (i || this.showResultsWhileTyping === !1) && y.set("autocomplete", "false"), y.set("fuzzyMatch", String(this.fuzzyMatch !== !1));
		}
		const ve = this.limit ?? 5, Y = this.reverseGeocodingLimit ?? ve;
		Y > 1 && _?.length !== 1 && console.warn("[MapTilerGeocodingControl] Warning: For reverse geocoding when limit > 1 then types must contain single value."), r ? (Y === 1 || this.exhaustiveReverseGeocoding || _?.length === 1) && y.set("limit", String(Y)) : y.set("limit", String(ve)), this.apiKey && y.set("key", this.apiKey), this.adjustUrl?.(u);
		const We = u.searchParams.get("types") === "" && u.searchParams.get("excludeTypes") !== "true", j = u.toString();
		if (j === this.lastSearchUrl) {
			e ? (this.clearListOnPick && h(this, l, $).call(this), this.picked = this.cachedFeatures[0]) : (this.listFeatures = this.cachedFeatures, h(this, l, x).call(this, "featureslisted", {
				features: this.listFeatures,
				external: a
			}), this.listFeatures[this.selectedItemIndex]?.id !== w(this, l, Z)?.id && (this.selectedItemIndex = -1));
			return;
		}
		h(this, l, x).call(this, "request", { urlObj: u }), this.lastSearchUrl = j;
		let E;
		if (We) E = {
			type: "FeatureCollection",
			features: []
		};
		else {
			const v = await fetch(j, {
				signal: s.signal,
				...this.fetchParameters
			});
			if (!v.ok) throw new Error(await v.text());
			E = await v.json();
		}
		h(this, l, x).call(this, "response", {
			url: j,
			featureCollection: E
		}), e ? (this.clearListOnPick && h(this, l, $).call(this), this.picked = E.features[0], this.cachedFeatures = [this.picked]) : (this.listFeatures = E.features.filter(this.filter ?? (() => !0)), r && this.listFeatures.unshift({
			type: "Feature",
			properties: {},
			id: `reverse_${r.decimalLongitude}_${r.decimalLatitude}`,
			place_name: `${r.decimalLatitude}, ${r.decimalLongitude}`,
			text: r.toCoordinateFormat("DMS"),
			place_type: ["reverse"],
			place_type_name: ["reverse"],
			center: [r.decimalLongitude, r.decimalLatitude],
			bbox: [
				r.decimalLongitude,
				r.decimalLatitude,
				r.decimalLongitude,
				r.decimalLatitude
			],
			geometry: {
				type: "Point",
				coordinates: [r.decimalLongitude, r.decimalLatitude]
			}
		}), h(this, l, x).call(this, "featureslisted", {
			features: this.listFeatures,
			external: a
		}), this.cachedFeatures = this.listFeatures, this.listFeatures[this.selectedItemIndex]?.id !== w(this, l, Z)?.id && (this.selectedItemIndex = -1), r && this.input.focus());
	} catch (o) {
		if (o && typeof o == "object" && "name" in o && o.name === "AbortError") return;
		throw o;
	} finally {
		s === this.abortController && (this.abortController = void 0);
	}
};
Pe = function(t) {
	this.reverseActive = this.enableReverse === "always", h(this, l, $).call(this), this.picked = void 0, h(this, l, ge).call(this, `${t[1].toFixed(6)}, ${nt(t[0], [-180, 180], !0).toFixed(6)}`), h(this, l, fe).call(this);
};
le = function(t) {
	if (!this.listFeatures) return;
	const e = t.key === "ArrowDown" ? 1 : t.key === "ArrowUp" ? -1 : 0;
	e && (this.input.focus(), this.focused = !0, t.preventDefault(), this.picked && this.selectedItemIndex === -1 && (this.selectedItemIndex = this.listFeatures.findIndex((i) => i.id === this.picked?.id)), this.selectedItemIndex === (this.picked || this.selectFirst !== !1 ? 0 : -1) && e === -1 && (this.selectedItemIndex = this.listFeatures.length), this.selectedItemIndex += e, this.selectedItemIndex >= this.listFeatures.length && (this.selectedItemIndex = -1), this.selectedItemIndex < 0 && (this.picked || this.selectFirst !== !1) && (this.selectedItemIndex = 0));
};
Ue = function(t) {
	h(this, l, me).call(this, t.target.value);
};
Ge = function(t) {
	(!this.picked || this.picked.id !== t.id) && (this.picked = t, this.searchValue = t.place_name);
};
Be = function(t) {
	this.selectedItemIndex = t;
};
Re = function() {
	(!this.selectFirst || this.picked) && (this.selectedItemIndex = -1), this.isFeatureListInteractedWith && (this.isFeatureListInteractedWith = !1);
};
ze = function() {
	this.isFeatureListInteractedWith = !0;
};
je = function() {
	setTimeout(() => {
		this.isFeatureListInteractedWith = !1;
	});
};
Ae = function() {
	this.searchValue = "", h(this, l, x).call(this, "queryclear"), this.picked = void 0, this.input.focus();
};
n.styles = css`
    ${unsafeCSS(ft)}
  `;
c([property({ attribute: !1 })], n.prototype, "adjustUrl", 2);
c([property({ type: String })], n.prototype, "apiKey", 2);
c([property({ type: String })], n.prototype, "apiUrl", 2);
c([property({ type: Array })], n.prototype, "bbox", 2);
c([property({ type: String })], n.prototype, "clearButtonTitle", 2);
c([property({ type: Boolean })], n.prototype, "clearListOnPick", 2);
c([property({ type: Boolean })], n.prototype, "clearOnBlur", 2);
c([property({ type: Boolean })], n.prototype, "collapsed", 2);
c([property({ attribute: !1 })], n.prototype, "country", 2);
c([property({ type: Number })], n.prototype, "debounceSearch", 2);
c([property({ type: String })], n.prototype, "enableReverse", 2);
c([property({ type: String })], n.prototype, "errorMessage", 2);
c([property({ type: Boolean })], n.prototype, "excludeTypes", 2);
c([property({ type: Boolean })], n.prototype, "exhaustiveReverseGeocoding", 2);
c([property({ type: Boolean })], n.prototype, "fetchFullGeometryOnPick", 2);
c([property({ type: Object })], n.prototype, "fetchParameters", 2);
c([property({ attribute: !1 })], n.prototype, "filter", 2);
c([property({ type: Object })], n.prototype, "fuzzyMatch", 2);
c([property({ type: String })], n.prototype, "iconsBaseUrl", 2);
c([property({ type: Boolean })], n.prototype, "keepListOpen", 2);
c([property({ attribute: !1 })], n.prototype, "language", 2);
c([property({ type: Number })], n.prototype, "limit", 2);
c([property({ type: Number })], n.prototype, "minLength", 2);
c([property({ type: String })], n.prototype, "noResultsMessage", 2);
c([property({ type: Boolean })], n.prototype, "openListOnTop", 2);
c([property({ type: String })], n.prototype, "placeholder", 2);
c([property({ type: Array })], n.prototype, "proximity", 2);
c([property({ type: Boolean })], n.prototype, "reverseActive", 2);
c([property({ type: String })], n.prototype, "reverseButtonTitle", 2);
c([property({ type: Object })], n.prototype, "reverseGeocodingExcludeTypes", 2);
c([property({ type: Number })], n.prototype, "reverseGeocodingLimit", 2);
c([property({ type: Array })], n.prototype, "reverseGeocodingTypes", 2);
c([property({ type: Object })], n.prototype, "selectFirst", 2);
c([property({ type: String })], n.prototype, "showPlaceType", 2);
c([property({ type: Object })], n.prototype, "showResultsWhileTyping", 2);
c([property({ type: Array })], n.prototype, "types", 2);
c([property({ type: String })], n.prototype, "worldview", 2);
c([query("input")], n.prototype, "input", 2);
c([state()], n.prototype, "searchValue", 2);
c([state()], n.prototype, "listFeatures", 2);
c([state()], n.prototype, "selectedItemIndex", 2);
c([state()], n.prototype, "picked", 2);
c([state()], n.prototype, "cachedFeatures", 2);
c([state()], n.prototype, "lastSearchUrl", 2);
c([state()], n.prototype, "error", 2);
c([state()], n.prototype, "abortController", 2);
c([state()], n.prototype, "focused", 2);
c([state()], n.prototype, "isFeatureListVisible", 2);
c([state()], n.prototype, "isFeatureListInteractedWith", 2);
n = c([customElement("maptiler-geocoder")], n);
var yt = [
	"adjustUrl",
	"apiKey",
	"apiUrl",
	"bbox",
	"clearButtonTitle",
	"clearListOnPick",
	"clearOnBlur",
	"collapsed",
	"country",
	"debounceSearch",
	"enableReverse",
	"errorMessage",
	"excludeTypes",
	"reverseGeocodingExcludeTypes",
	"exhaustiveReverseGeocoding",
	"fetchParameters",
	"fetchFullGeometryOnPick",
	"filter",
	"fuzzyMatch",
	"iconsBaseUrl",
	"keepListOpen",
	"language",
	"limit",
	"reverseGeocodingLimit",
	"minLength",
	"noResultsMessage",
	"openListOnTop",
	"placeholder",
	"proximity",
	"reverseActive",
	"reverseButtonTitle",
	"selectFirst",
	"showPlaceType",
	"showResultsWhileTyping",
	"types",
	"reverseGeocodingTypes",
	"worldview"
], vt = "svg{display:block;fill:var(--maptiler-geocode-marker-fill, #3170fe);stroke:var(--maptiler-geocode-marker-stroke, #3170fe);height:30px}:host(.marker-selected){z-index:2}:host(.marker-selected) svg path{fill:var(--maptiler-geocode-marker-selected-fill, #98b7ff);stroke:var(--maptiler-geocode-marker-selected-stroke, #3170fe)}:host(.marker-reverse) svg path{fill:var(--maptiler-geocode-marker-reverse-fill, silver);stroke:var(--maptiler-geocode-marker-reverse-stroke, gray)}:host(.marker-interactive){cursor:pointer!important}:host(.marker-fuzzy) svg path{fill:var(--maptiler-geocode-marker-fuzzy-fill, silver);stroke:var(--maptiler-geocode-marker-fuzzy-stroke, gray)}:host(.marker-fuzzy.marker-selected) svg path{fill:var(--maptiler-geocode-marker-selected-fuzzy-fill, #ddd);stroke:var(--maptiler-geocode-marker-selected-fuzzy-stroke, silver)}";
var xt = Object.getOwnPropertyDescriptor, bt = (t, e, i, a) => {
	for (var s = a > 1 ? void 0 : a ? xt(e, i) : e, o = t.length - 1, r; o >= 0; o--) (r = t[o]) && (s = r(s) || s);
	return s;
};
var ne = class extends LitElement {
	render() {
		return svg`
      <svg
        viewBox="0 0 70 85"
        fill="none"
        class:in-map={displayIn !== "list"}
      >
        <path
          stroke-width="4"
          d="M 5,33.103579 C 5,17.607779 18.457,5 35,5 C 51.543,5 65,17.607779 65,33.103579 C 65,56.388679 40.4668,76.048179 36.6112,79.137779 C 36.3714,79.329879 36.2116,79.457979 36.1427,79.518879 C 35.8203,79.800879 35.4102,79.942779 35,79.942779 C 34.5899,79.942779 34.1797,79.800879 33.8575,79.518879 C 33.7886,79.457979 33.6289,79.330079 33.3893,79.138079 C 29.5346,76.049279 5,56.389379 5,33.103579 Z M 35.0001,49.386379 C 43.1917,49.386379 49.8323,42.646079 49.8323,34.331379 C 49.8323,26.016779 43.1917,19.276479 35.0001,19.276479 C 26.8085,19.276479 20.1679,26.016779 20.1679,34.331379 C 20.1679,42.646079 26.8085,49.386379 35.0001,49.386379 Z"
        />
      </svg>
    `;
	}
};
ne.styles = css`
    ${unsafeCSS(vt)}
  `;
ne = bt([customElement("maptiler-geocode-marker")], ne);
var wt = "@maptiler/geocoding-control", kt = "3.0.0";
function we(t) {
	const e = index_default$1(featureCollection([polygon([[
		[180, 90],
		[-180, 90],
		[-180, -90],
		[180, -90],
		[180, 90]
	]]), t]));
	if (!e) return;
	e.properties = { isMask: !0 };
	const i = V(index_default$2(t)), a = (i[2] - i[0]) / 360 / 1e3, s = i[0] < -180, o = i[2] > 180, r = index_default(t);
	if (r.features.length > 1 && (s || o)) for (const u of r.features) {
		const y = V(index_default$2(u));
		if (o && y[0] < -180 + a) for (const M of u.geometry.coordinates) for (const _ of M) _[0] += 360 - a;
		if (s && y[2] > 180 - a) for (const M of u.geometry.coordinates) for (const _ of M) _[0] -= 360 - a;
	}
	return featureCollection([r.features.length < 2 ? t : index_default$3(r) ?? t, e]);
}
var _t = {
	continental_marine: 4,
	country: 4,
	major_landform: 8,
	region: 5,
	subregion: 6,
	county: 7,
	joint_municipality: 8,
	joint_submunicipality: 9,
	municipality: 10,
	municipal_district: 11,
	locality: 12,
	neighbourhood: 13,
	place: 14,
	postal_code: 14,
	road: 16,
	poi: 17,
	address: 18,
	"poi.peak": 15,
	"poi.shop": 18,
	"poi.cafe": 18,
	"poi.restaurant": 18,
	"poi.aerodrome": 13
}, Lt = {
	fill: {
		paint: {
			"fill-color": "#000",
			"fill-opacity": .1
		},
		filter: [
			"all",
			[
				"==",
				["geometry-type"],
				"Polygon"
			],
			["has", "isMask"]
		]
	},
	line: {
		layout: { "line-cap": "square" },
		paint: {
			"line-width": [
				"case",
				[
					"==",
					["geometry-type"],
					"Polygon"
				],
				2,
				3
			],
			"line-dasharray": [1, 1],
			"line-color": "#3170fe"
		},
		filter: ["!", ["has", "isMask"]]
	}
}, W = "mtlr-gc-full-geom", ke = "mtlr-gc-full-geom-fill", _e = "mtlr-gc-full-geom-line";
var $t = class extends import_maplibre_gl.default.Evented {
	#e = {};
	#t;
	#i;
	constructor(e = {}) {
		super(), this.setOptions(e);
	}
	/** @internal Not to be called directly */
	onAdd(e) {
		this.#t = e, this.#i = e._container.ownerDocument.createElement("maptiler-geocoder"), this.#i.classList.add("maplibregl-geocoder"), this.#v(), this.#k();
		const i = e._container.ownerDocument.createElement("div");
		return i.classList.add("maplibregl-ctrl-geocoder", "maplibregl-ctrl", "maplibregl-ctrl-group"), i.style.position = "relative", i.style.zIndex = "3", i.appendChild(this.#i), setTimeout(() => this.#i?.setOptions({ openListOnTop: i.matches(".maplibregl-ctrl-bottom-left *, .maplibregl-ctrl-bottom-right *") })), i;
	}
	/** @internal Not to be called directly */
	onRemove() {
		this.#_(), this.#t = void 0, this.#i = void 0;
	}
	getOptions() {
		return { ...this.#e };
	}
	setOptions(e) {
		Object.assign(this.#e, e), this.#v();
	}
	setQuery(e) {
		this.#i?.setQuery(e);
	}
	submitQuery(e) {
		this.#i?.submitQuery(e);
	}
	clearMap() {
		this.#o = [], this.#p(void 0, void 0);
	}
	clearList() {
		this.#i?.clearList();
	}
	setReverseMode(e) {
		this.setOptions({ reverseActive: e });
	}
	focus(e) {
		this.#i?.focus(e);
	}
	blur() {
		this.#i?.blur();
	}
	/** Markers currently displayed on the map */
	#l = /* @__PURE__ */ new Map();
	/** Marker representing the selected feature */
	#c;
	/** Marker representing the picked feature */
	#r;
	/** Features currently marked on the map */
	#o;
	/** Used to restore features on style switch */
	#a;
	/** Remember last feature that the map flew to as to not do it again */
	#m;
	#g = {
		reversetoggle: (e) => {
			const i = this.#t?.getCanvasContainer();
			i && (i.style.cursor = e.detail.reverse ? "crosshair" : ""), this.#s("reversetoggle", e.detail);
		},
		querychange: (e) => {
			const i = e.detail.reverseCoords;
			this.#w(i ? [i.decimalLongitude, i.decimalLatitude] : void 0), this.#s("querychange", e.detail);
		},
		queryclear: () => {
			this.#w(void 0), this.#s("queryclear");
		},
		request: (e) => {
			this.#s("request", e.detail);
		},
		response: (e) => {
			this.#s("response", e.detail);
		},
		select: (e) => {
			const i = e.detail.feature;
			i && this.#d && this.#e.flyToSelected && this.#x(i.center, this.#h(i)), this.#o && i && this.#O(i), this.#s("select", e.detail);
		},
		pick: (e) => {
			const i = e.detail.feature;
			i && i.id !== this.#m && this.#d && (this.#L(i), this.#p(this.#o, i)), this.#m = i?.id, this.#s("pick", e.detail);
		},
		featuresshow: () => {
			this.#s("featuresshow");
		},
		featureshide: () => {
			this.#s("featureshide");
		},
		featureslisted: (e) => {
			const i = e.detail.features;
			this.#o = i, this.#p(this.#o, void 0), this.#$(e), this.#s("featureslisted", e.detail);
		},
		featuresclear: () => {
			this.#o = void 0, this.#p(void 0, void 0), this.#s("featuresclear");
		},
		focusin: () => {
			this.#s("focusin");
		},
		focusout: () => {
			this.#s("focusout");
		}
	};
	#y = {
		render: () => {
			const e = this.#t?.getZoom(), i = this.#t?.getCenter();
			this.#i?.handleMapChange(e && i ? [
				e,
				i.lng,
				i.lat
			] : void 0);
		},
		click: (e) => {
			this.#i?.handleMapClick([e.lngLat.lng, e.lngLat.lat]);
		},
		styledata: () => {
			setTimeout(() => {
				this.#a && this.#u();
			});
		}
	};
	#v() {
		this.#i && (this.#i.setOptions(this.#e), this.#i.fetchFullGeometryOnPick = this.#e.pickedResultStyle !== "marker-only");
	}
	#k() {
		if (!(!this.#i || !this.#t)) {
			for (const [e, i] of Object.entries(this.#g)) this.#i.addEventListener(e, i);
			for (const [e, i] of Object.entries(this.#y)) this.#t.on(e, i);
		}
	}
	#_() {
		if (!(!this.#i || !this.#t)) {
			for (const [e, i] of Object.entries(this.#g)) this.#i.removeEventListener(e, i);
			for (const [e, i] of Object.entries(this.#y)) this.#t.off(e, i);
		}
	}
	#s(e, i) {
		return super.fire({
			type: e,
			...i ?? {}
		});
	}
	#L(e) {
		e.bbox[0] === e.bbox[2] && e.bbox[1] === e.bbox[3] ? this.#x(e.center, this.#h(e)) : this.#b(V(e.bbox), 50, this.#h(e));
	}
	#$({ detail: { features: e, external: i } }) {
		if (!e || e.length === 0 || !this.#d || this.#e.flyToFeatures === !1 || this.#e.flyToFeatures === "never" || !i && (this.#e.flyToFeatures === void 0 || this.#e.flyToFeatures === "external")) return;
		const a = e.every((r) => r.matching_text), s = e.reduce((r, u) => a || !u.matching_text ? [
			Math.min(r[0], u.bbox[0]),
			Math.min(r[1], u.bbox[1]),
			Math.max(r[2], u.bbox[2]),
			Math.max(r[3], u.bbox[3])
		] : r, [
			180,
			90,
			-180,
			-90
		]), o = e.map((r) => this.#h(r)).filter((r) => r !== void 0).reduce((r, u) => r === void 0 ? u : Math.max(r, u), void 0);
		this.#b(V(s), 50, o);
	}
	#h(e) {
		if (e.bbox[0] !== e.bbox[2] || e.bbox[1] !== e.bbox[3]) return;
		const i = e.id.replace(/\..*/, ""), a = this.#e.zoom ?? _t;
		return (Array.isArray(e.properties?.categories) ? e.properties.categories.reduce((s, o) => {
			const r = a[i + "." + o];
			return s === void 0 ? r : r === void 0 ? s : Math.max(s, r);
		}, void 0) : void 0) ?? a[i];
	}
	get #d() {
		return !!this.#e.flyTo || this.#e.flyTo === void 0;
	}
	get #I() {
		return typeof this.#e.flyTo == "boolean" ? {} : this.#e.flyTo;
	}
	get #F() {
		return typeof this.#e.flyTo == "boolean" ? {} : this.#e.flyTo;
	}
	#x(e, i) {
		this.#t?.flyTo({
			center: e,
			...i ? { zoom: i } : {},
			...this.#I
		});
	}
	#b(e, i, a) {
		this.#t?.fitBounds([[e[0], e[1]], [e[2], e[3]]], {
			padding: i,
			...a ? { maxZoom: a } : {},
			...this.#F
		});
	}
	#w(e) {
		if (!(this.#e.marker === !1 || this.#e.marker === null || !this.#t)) {
			if (!e) {
				this.#r?.remove(), this.#r = void 0;
				return;
			}
			this.#r || (this.#e.marker instanceof Function ? this.#r = this.#e.marker(this.#t) ?? void 0 : (this.#r = this.#f(this.#e.marker).setLngLat(e).addTo(this.#t), this.#r.getElement().classList.add("marker-reverse"))), this.#r?.setLngLat(e);
		}
	}
	#p(e, i) {
		if (!this.#t) return;
		for (const s of this.#l.values()) s.remove();
		this.#l = /* @__PURE__ */ new Map(), this.#n(void 0);
		const a = () => {
			if (!i || !this.#t || this.#e.marker === !1 || this.#e.marker === null) return;
			const s = this.#e.marker instanceof Function ? this.#e.marker(this.#t, i) : this.#f(this.#e.marker).setLngLat(i.center).addTo(this.#t);
			s && this.#l.set(i, s);
		};
		if (i?.geometry.type === "GeometryCollection") {
			const s = i.geometry.geometries.filter((o) => o.type === "Polygon" || o.type === "MultiPolygon");
			if (s.length > 0) {
				const o = index_default$3(featureCollection(s.map((r) => feature(r))));
				if (o) {
					const r = we({
						...i,
						geometry: o.geometry
					});
					r && this.#n(r);
				}
			} else {
				const o = i.geometry.geometries.filter((r) => r.type === "LineString" || r.type === "MultiLineString");
				o.length > 0 && this.#n({
					...i,
					geometry: {
						type: "GeometryCollection",
						geometries: o
					}
				});
			}
		} else if (i?.geometry.type.endsWith("Polygon")) {
			const s = we(i);
			s && this.#n(s), this.#e.pickedResultStyle === "full-geometry-including-polygon-center-marker" && a();
		} else i?.geometry.type.endsWith("LineString") ? this.#n(i) : i?.geometry.type.endsWith("Point") && a();
		if (this.#e.showResultMarkers !== !1 && this.#e.showResultMarkers !== null) for (const s of e ?? []) {
			if (s.id === i?.id || s.place_type.includes("reverse")) continue;
			let o;
			if (this.#e.showResultMarkers instanceof Function) {
				if (o = this.#e.showResultMarkers(this.#t, s), !o) continue;
			} else o = this.#f(this.#e.showResultMarkers).setLngLat(s.center).setPopup(new import_maplibre_gl.default.Popup({
				offset: [1, -27],
				closeButton: !1,
				closeOnMove: !0,
				className: "maptiler-gc-popup"
			}).setText(s.place_type[0] === "reverse" ? s.place_name : s.place_name.replace(/,.*/, ""))).addTo(this.#t), o.getElement().classList.add("marker-interactive");
			const r = o.getElement();
			r.addEventListener("click", (u) => {
				u.stopPropagation(), this.#s("markerclick", {
					feature: s,
					marker: o
				});
			}), r.addEventListener("mouseenter", () => {
				this.#s("markermouseenter", {
					feature: s,
					marker: o
				}), o.togglePopup();
			}), r.addEventListener("mouseleave", () => {
				this.#s("markermouseleave", {
					feature: s,
					marker: o
				}), o.togglePopup();
			}), r.classList.toggle("marker-fuzzy", !!s.matching_text), this.#l.set(s, o);
		}
	}
	#O(e) {
		this.#c?.getElement().classList.toggle("marker-selected", !1), this.#c = void 0, this.#e.markerOnSelected !== !1 && (this.#c = this.#l.get(e), this.#c?.getElement().classList.toggle("marker-selected", !0));
	}
	#u() {
		if (!this.#t?._loaded) {
			this.#t?.once("load", () => {
				this.#u();
			});
			return;
		}
		const e = this.#M(), i = this.#t.getSource(W);
		!e?.fill && !e?.line || !i && !this.#a || (i ? i.setData(this.#a ?? featureCollection([])) : this.#a && this.#t.addSource("mtlr-gc-full-geom", {
			type: "geojson",
			data: this.#a
		}), !this.#t.getLayer("mtlr-gc-full-geom-fill") && e.fill && this.#t.addLayer({
			...e.fill,
			id: "mtlr-gc-full-geom-fill",
			type: "fill",
			source: "mtlr-gc-full-geom"
		}), !this.#t.getLayer("mtlr-gc-full-geom-line") && e.line && this.#t.addLayer({
			...e.line,
			id: "mtlr-gc-full-geom-line",
			type: "line",
			source: "mtlr-gc-full-geom"
		}));
	}
	#n(e) {
		this.#a = e, this.#u();
	}
	#f(e) {
		return typeof e != "object" && (e = {
			element: this.#t?._container.ownerDocument.createElement("maptiler-geocode-marker"),
			offset: [1, -13]
		}), new import_maplibre_gl.default.Marker(e);
	}
	#M() {
		const { fullGeometryStyle: e } = this.#e;
		if (e === !0 || e === void 0) return Lt;
		if (!(e === !1 || e === null)) return e;
	}
};
var jt = class extends $t {
	#e;
	constructor(e = {}) {
		super(e);
	}
	/** @internal Not to be called directly */
	onAdd(e) {
		this.#e = e, e.telemetry.registerModule(wt, kt);
		const i = this.getOptions(), { primaryLanguage: a, apiKey: s } = e.getSdkConfig();
		if (i.apiKey === void 0 && this.setOptions({ apiKey: s }), i.language === void 0) {
			const r = a.code?.match(/^([a-z]{2,3})($|_|-)/);
			r && this.setOptions({ language: r[1] });
		}
		const o = super.onAdd(e);
		return o.classList.add("maptiler-ctrl-geocoder"), o.querySelector("maptiler-geocoder")?.classList.add("maptiler-geocoder"), o;
	}
	/** @internal Not to be called directly */
	onRemove() {
		super.onRemove(), this.#e = void 0;
	}
	setOptions(e) {
		const i = e.adjustUrl;
		super.setOptions({
			...e,
			adjustUrl: (a) => {
				i?.(a);
				const s = this.getOptions();
				(j.session ? e.session !== !1 : e.session === !0) && this.#e && (!s.apiUrl || new URL(s.apiUrl).host === new URL("https://api.maptiler.com/geocoding").host) && a.searchParams.append("mtsid", this.#e.getMaptilerSessionId());
			}
		});
	}
};
//#endregion
export { Lt as DEFAULT_GEOMETRY_STYLE, jt as GeocodingControl, jt as MaptilerGeocodingControl, X as MaptilerGeocodeClearIconElement, ee as MaptilerGeocodeFailIconElement, te as MaptilerGeocodeLoadingIconElement, ne as MaptilerGeocodeMarkerElement, ie as MaptilerGeocodeReverseGeocodingIconElement, se as MaptilerGeocodeSearchIconElement, n as MaptilerGeocoderElement, ke as RESULT_LAYER_FILL, _e as RESULT_LAYER_LINE, W as RESULT_SOURCE, _t as ZOOM_DEFAULTS };

//# sourceMappingURL=@maptiler_geocoding-control_maptilersdk.js.map