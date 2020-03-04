/*
**	rin/element
**
**	Copyright (c) 2013-2020, RedStar Technologies, All rights reserved.
**	https://www.rsthn.com/
**
**	THIS LIBRARY IS PROVIDED BY REDSTAR TECHNOLOGIES "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
**	INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A 
**	PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL REDSTAR TECHNOLOGIES BE LIABLE FOR ANY
**	DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT 
**	NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; 
**	OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, 
**	STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE
**	USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

const { Rin, Model, Template } = require('@rsthn/rin');

/*
**	Base class for custom elements.
*/

const Element = module.exports = 
{
	/**
	**	Map containing the original prototypes for all registered elements.
	*/
	protos: { },

	/**
	**	Indicates if the element is a root element, that is, the target element to attach elements having data-ref attribute.
	*/
	isRoot: false,

	/**
	**	Model type (class) for the element's model.
	*/
	modelt: Model,

	/**
	**	Data model related to the element.
	*/
	model: null,

	/**
	**	Events map.
	*/
	events: null,

	/**
	**	Element constructor.
	*/
	__ctor: function()
	{
		this._list_watch = [];
		this._list_visible = [];
		this._list_property = [];

		if (this.model != null)
		{
			let tmp = this.model;
			this.model = null;
			this.setModel (tmp);
		}

		this.init();

		Object.keys(this._super).reverse().forEach(i =>
		{
			if ('init' in this._super[i])
				this._super[i].init();
		});

		if (this.events)
			this.bindEvents (this.events);

		this.collectWatchers();
	},

	/**
	**	Initializes the element. Called after construction of the instance.
	**
	**	>> void init();
	*/
	init: function()
	{
	},

	/**
	**	Sets the model of the element and executes the modelChanged event handler.
	**
	**	>> Element setModel (Model model, [bool update=true]);
	*/
	setModel: function (model, update)
	{
		if (!model) return this;

		model = Rin.ensureTypeOf(this.modelt, model);

		if (this.model != null)
		{
			this.model.removeEventListener ("modelChanged", this.onModelPreChanged, this);
			this.model.removeEventListener ("propertyChanging", this.onModelPropertyChanging, this);
			this.model.removeEventListener ("propertyChanged", this.onModelPropertyPreChanged, this);
			this.model.removeEventListener ("propertyRemoved", this.onModelPropertyRemoved, this);
		}

		this.model = model;

		this.model.addEventListener ("modelChanged", this.onModelPreChanged, this);
		this.model.addEventListener ("propertyChanging", this.onModelPropertyChanging, this);
		this.model.addEventListener ("propertyChanged", this.onModelPropertyPreChanged, this);
		this.model.addEventListener ("propertyRemoved", this.onModelPropertyRemoved, this);

		if (update !== false)
			this.model.update();

		return this;
	},

	/**
	**	Returns the model of the element. This is a dummy function returning the public attribute "model" of this class.
	**
	**	>> Model getModel();
	*/
	getModel: function ()
	{
		return this.model;
	},

	/*
	**	Returns the width of the element.
	**
	**	>> float getWidth([elem]);
	*/
	getWidth: function (elem)
	{
		return (elem || this).getBoundingClientRect().width;
	},

	/*
	**	Returns the height of the element.
	**
	**	>> float getHeight([elem]);
	*/
	getHeight: function (elem)
	{
		return (elem || this).getBoundingClientRect().height;
	},

	/**
	**	Binds all events in the specified map to the element, the events map can have one of the following forms:
	**
	**		"click .button": "doSomething",		(Delegated Event)
	**		"click .button": function() { },	(Delegated Event)
	**		"myevt @this": "...",				(Element Event)
	**		"myevt": "...",						(Element Event)
	**		"myevt @objName": "...",			(Element Event)
	**		"#propname": "...",					(Property Changed Event)
	**		"keyup(10) .input": "..."			(Delegated Event with Parameters)
	**
	**	>> Element bindEvents (object events);
	*/
	bindEvents: function (events)
	{
		for (var evtstr in events)
		{
			let hdl = events[evtstr];

			if (Rin.typeOf(hdl) == 'string')
				hdl = this[hdl];

			hdl = hdl.bind(this);

			var i = evtstr.indexOf(" ");

			var name = i == -1 ? evtstr : evtstr.substr(0, i);
			var selector = i == -1 ? "" : evtstr.substr(i + 1);

			let args = null;

			var j = name.indexOf("(");
			if (j != -1)
			{
				args = name.substr(j+1, name.length-j-2).split(",");
				name = name.substr(0, j);
			}

			if (selector.substr(0,1) == "@")
			{
				if (selector.substr(1) == "this")
				{
					this.listen(name, hdl);
				}
				else
					this[selector.substr(1)].addEventListener(name, hdl);

				continue;
			}

			if (name.substr(0, 1) == "#")
			{
				this.listen("propertyChanged."+name.substr(1), hdl);
				continue;
			}

			if (args != null)
			{
				switch (name)
				{
					case "keyup": case "keydown":
						this.listen (name, selector, function (evt)
						{
							if (Rin.indexOf(args, evt.keyCode.toString()) != -1)
								return hdl (evt, args);

							evt.continuePropagation = true;
						});

						continue;
				}
			}

			this.listen (name, selector, hdl);
		}

		return this;
	},

	/**
	**	Listens for an event for elements matching the specified selector, returns an object with a single method remove() used
	**	to remove the listener when it is no longer needed.
	**
	**	>> object listen (string eventName, string selector, function handler);
	**	>> object listen (string eventName, function handler);
	*/
	listen: function (eventName, selector, handler)
	{
		if (Rin.typeOf(selector) == "function")
		{
			handler = selector;
			selector = null;
		}

		let callback = null;
		let self = this;

		this.addEventListener (eventName, callback = (evt) =>
		{
			let root = this.findRoot (evt.target);
			if (root !== this) return;

			if (evt.continuePropagation === false)
				return;

			evt.continuePropagation = true;

			if (selector && selector != "*")
			{
				let elems = this.querySelectorAll(selector);

				evt.source = evt.target;

				while (evt.source !== this)
				{
					let i = Rin.indexOf (elems, evt.source);
					if (i !== -1)
					{
						evt.continuePropagation = false;

						handler.call (this, evt, evt.detail);
						break;
					}
					else
					{
						evt.source = evt.source.parentElement;
					}
				}
			}
			else
			{
				evt.continuePropagation = false;

				handler.call (this, evt, evt.detail);
			}

			if (!evt.continuePropagation)
			{
				evt.preventDefault();
				evt.stopPropagation();
			}
		},
		true);

		return { removed: false, remove: function() { if (this.removed) return; this.removed = true; self.removeEventListener(eventName, callback, true); } };
	},

	/**
	**	Dispatches a new event with the specified name and the given arguments.
	**
	**	>> void dispatch (string eventName, object args);
	*/
	dispatch: function (eventName, args)
	{
		this.dispatchEvent (new CustomEvent (eventName, { bubbles: true, detail: args }));
	},

	/**
	**	Sets the innerHTML property of the element and runs some post set-content tasks.
	**
	**	>> void setInnerHTML (value);
	*/
	setInnerHTML: function (value)
	{
		this.innerHTML = value;
		this.collectWatchers();
	},

	/**
	**	Collects all watchers elements (data-watch, data-visible, data-property), that depend on the model, should be invoked
	**	when the structure of the element changed (added/removed children). This is automatically called when the setInnerHTML
	**	method is called.
	**
	**	>> void collectWatchers ();
	*/
	collectWatchers: function ()
	{
		let self = this;
		let modified = false;
		let list;

		let _list_watch_length = this._list_watch.length;
		let _list_visible_length = this._list_visible.length;
		let _list_property_length = this._list_property.length;

		list = this.querySelectorAll("[data-watch]");
		for (let i = 0; i < list.length; i++)
		{
			for (let j of list[i].querySelectorAll('.pseudo'))
				j.remove();

			list[i]._template = Template.compile(list[i].innerHTML);
			list[i]._watch = new RegExp(list[i].dataset.watch);
			list[i].innerHTML = '';

			list[i].removeAttribute('data-watch');
			this._list_watch.push(list[i]);
		}

		list = this.querySelectorAll("[data-visible]");
		for (let i = 0; i < list.length; i++)
		{
			list[i]._visible = Template.compile(list[i].dataset.visible);

			list[i].removeAttribute('data-visible');
			this._list_visible.push(list[i]);
		}

		list = this.querySelectorAll("[data-property]");
		for (let i = 0; i < list.length; i++)
		{
			list[i].onchange = function()
			{
				switch (this.type)
				{
					case 'checkbox':
						self.getModel().set(this.name, this.checked ? '1' : '0');
						break;

					case 'field':
						self.getModel().set(this.name, this.getValue());
						break;

					default:
						self.getModel().set(this.name, this.value);
						break;
				}
			};

			list[i].name = list[i].dataset.property;

			list[i].removeAttribute('data-property');
			this._list_property.push(list[i]);
		}

		this._list_watch = this._list_watch.filter(i => i.parentElement != null);
		if (_list_watch_length != this._list_watch.length) modified = true;

		this._list_visible = this._list_visible.filter(i => i.parentElement != null);
		if (_list_visible_length != this._list_visible.length) modified = true;

		this._list_property = this._list_property.filter(i => i.parentElement != null);
		if (_list_property_length != this._list_property.length) modified = true;

		if (this.model != null && modified)
			this.model.update();
	},

	/**
	**	Executed when the element is created and yet not attached to the DOM tree.
	**
	**	>> void onCreated ();
	*/
	onCreated: function()
	{
	},

	/**
	**	Executed when the element is attached to the DOM tree.
	**
	**	>> void onConnected ();
	*/
	onConnected: function()
	{
	},

	/**
	**	Executed when the element is no longer a part of the DOM tree.
	**
	**	>> void onDisconnected ();
	*/
	onDisconnected: function()
	{
	},

	/**
	**	Executed on the root element when a child element has data-ref attribute and it was added to the root.
	**
	**	>> void onRefAdded (string name);
	*/
	onRefAdded: function (name)
	{
	},

	/**
	**	Executed on the root element when a child element has data-ref attribute and it was removed from the root.
	**
	**	>> void onRefRemoved (string name);
	*/
	onRefRemoved: function (name)
	{
	},

	/**
	**	Event handler invoked when the model has changed, executed before onModelChanged() to update internal dependencies,
	**	should not be overriden or elements watching the model will not be updated.
	**
	**	>> void onModelPreChanged (evt, args);
	*/
	onModelPreChanged: function (evt, args)
	{
		let data = this.getModel().get();

		for (let i = 0; i < this._list_watch.length; i++)
		{
			for (let j of args.fields)
			{
				if (!this._list_watch[i]._watch.test(j))
					continue;

				this._list_watch[i].innerHTML = this._list_watch[i]._template(data);
				break;
			}
		}

		for (let i = 0; i < this._list_visible.length; i++)
		{
			if (this._list_visible[i]._visible(data, 'arg'))
				this._list_visible[i].style.display = 'block';
			else
				this._list_visible[i].style.display = 'none';
		}

		this.onModelChanged(evt, args);
	},

	/**
	**	Event handler invoked when the model has changed.
	**
	**	>> void onModelChanged (evt, args);
	*/
	onModelChanged: function (evt, args)
	{
	},

	/**
	**	Event handler invoked when a property of the model is changing.
	**
	**	>> void onModelPropertyChanging (evt, args);
	*/
	onModelPropertyChanging: function (evt, args)
	{
	},

	/**
	**	Event handler invoked when a property of the model has changed, executed before onModelPropertyChanged() to update internal
	**	dependencies, should not be overriden or elements depending on the property will not be updated.
	**
	**	>> void onModelPropertyPreChanged (evt, args);
	*/
	onModelPropertyPreChanged: function (evt, args)
	{
		for (let i = 0; i < this._list_property.length; i++)
		{
			if (this._list_property[i].name == args.name)
			{
				let trigger = true;

				switch (this._list_property[i].type)
				{
					case 'radio':
						if (this._list_property[i].value != args.value)
						{
							this._list_property[i].parentElement.classList.remove('active');
							continue;
						}

						this._list_property[i].checked = true;
						this._list_property[i].parentElement.classList.add('active');
						break;

					case 'checkbox':
						if (~~args.value)
						{
							this._list_property[i].checked = true;
							this._list_property[i].parentElement.classList.add('active');
						}
						else
						{
							this._list_property[i].checked = false;
							this._list_property[i].parentElement.classList.remove('active');
						}

						break;

					case 'field':
						this._list_property[i].setValue (args.value);
						trigger = false;
						break;

					default:
						this._list_property[i].value = args.value;

						if (this._list_property[i].value != args.value)
							trigger = false;

						break;
				}

				if (trigger && this._list_property[i].onchange)
					this._list_property[i].onchange();
			}
		}

		this.onModelPropertyChanged(evt, args);
	},

	/**
	**	Event handler invoked when a property of the model has changed. Automatically triggers an
	**	internal event named "propertyChanged.<propertyName>".
	**
	**	>> void onModelPropertyChanged (evt, args);
	*/
	onModelPropertyChanged: function (evt, args)
	{
		this.dispatch ("propertyChanged." + args.name, args);
		this.dispatch ("propertyChanged", args);
	},

	/**
	**	Event handler invoked when a property of the model is removed.
	**
	**	>> void onModelPropertyRemoved (evt, args);
	*/
	onModelPropertyRemoved: function (evt, args)
	{
	},

	/*
	**	Registers a new custom element with the specified name, extra functionality can be added with one or more prototypes, by default
	**	all elements also get the Rin.Element prototype. Note that the final prototypes of all registered elements are stored, and
	**	if you want to inherit another element's prototype just provide its name (string) in the protos argument list.
	**
	**	>> class register (string name, (object|string)... protos);
	*/
	register: function (name, ...protos)
	{
		var newElement = class extends HTMLElement
		{
			constructor()
			{
				super();
				this.invokeConstructor = true;

				this._super = { };

				for (let i of Object.entries(this.constructor.prototype._super))
				{
					this._super[i[0]] = { };

					for (let j of Object.entries(i[1])) {
						this._super[i[0]][j[0]] = j[1].bind(this);
					}
				}

				this.onCreated();
			}

			findRoot(srcElement)
			{
				let elem = srcElement ? srcElement : this.parentElement;

				while (elem != null)
				{
					if ("isRoot" in elem && elem.isRoot)
						return elem;

					elem = elem.parentElement;
				}

				return globalThis;
			}

			connectedCallback()
			{
				if (this.dataset.ref)
				{
					let root = this.findRoot();
					if (root)
					{
						root[this.dataset.ref] = this;
						this.root = root;
					}
				}

				if (this.invokeConstructor)
				{
					this.invokeConstructor = false;
					this.__ctor();
				}

				if (this.root)
					this.root.onRefAdded (this.dataset.ref);

				this.onConnected();
			}

			disconnectedCallback()
			{
				if (this.dataset.ref && this.root)
				{
					this.root.onRefRemoved (this.dataset.ref);

					root[this.dataset.ref] = null;
					this.root = null;
				}

				this.onDisconnected();
			}
		};

		Rin.override (newElement.prototype, Element);

		const proto = { };
		const _super = { };
		const events = { };

		for (let i = 0; i < protos.length; i++)
		{
			if (!protos[i]) continue;

			if (Rin.typeOf(protos[i]) == 'string')
			{
				const name = protos[i];

				protos[i] = Element.protos[name];
				if (!protos[i]) continue;

				_super[name] = { };

				for (let f in protos[i])
				{
					if (Rin.typeOf(protos[i][f]) != 'function')
						continue;

					_super[name][f] = protos[i][f];
				}
			}

			if ('_super' in protos[i])
				Rin.override (_super, protos[i]._super);

			if ('events' in protos[i])
				Rin.override (events, protos[i].events);

			Rin.override (newElement.prototype, protos[i]);
			Rin.override (proto, protos[i]);
		}

		newElement.prototype._super = _super;
		newElement.prototype.events = events;

		proto._super = _super;

		customElements.define (name, newElement);
		Element.protos[name] = proto;

		return newElement;
	}
};
