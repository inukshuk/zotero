/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    
    You should have received a copy of the GNU General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

/*
 * This object contains the various functions for the interface
 */
var Zotero_LocateMenu = new function() {
	XPCOMUtils.defineLazyServiceGetter(this, "ios", "@mozilla.org/network/io-service;1", "nsIIOService");
	
  	/**
  	 * Clear and build the locate menu
  	 */
	this.buildLocateMenu = function() {
		var locateMenu = document.getElementById('zotero-tb-locate-menu');
		
		// clear menu
		while(locateMenu.childElementCount > 0) {
			locateMenu.removeChild(locateMenu.firstChild);
		}
		
		var selectedItems = [item for each(item in ZoteroPane.getSelectedItems()) if(!item.isNote())];
		
		if(selectedItems.length) {
			_addViewOptions(locateMenu, selectedItems, true);
			
			var availableEngines = _getAvailableLocateEngines(selectedItems);
			// add engines that are available for selected items
			if(availableEngines.length) {
				locateMenu.appendChild(document.createElement("menuseparator"));
				_addLocateEngines(locateMenu, availableEngines, true);
			}
		} else {
			// add "no items selected"
			menuitem = _createMenuItem(Zotero.getString("pane.item.selected.zero"), "no-items-selected");
			locateMenu.appendChild(menuitem);
			menuitem.disabled = true;
		}
		
		// add installable locate menus, if there are any
		if(window.Zotero_Browser) {
			var installableLocateEngines = _getInstallableLocateEngines();
		} else {
			var installableLocateEngines = [];
		}
		
		if(installableLocateEngines.length) {
			locateMenu.appendChild(document.createElement("menuseparator"));
			
			for each(var locateEngine in installableLocateEngines) {
				var menuitem = document.createElement("menuitem");
				menuitem.setAttribute("label", locateEngine.label);
				menuitem.setAttribute("class", "menuitem-iconic");
				menuitem.setAttribute("image", locateEngine.image);
				menuitem.zoteroLocateInfo = locateEngine;
				menuitem.addEventListener("command", _addLocateEngine, false);
				
				locateMenu.appendChild(menuitem);
			}
		}
		
		// add manage menu item
		locateMenu.appendChild(document.createElement("menuseparator"));
		
		var menuitem = document.createElement("menuitem");
		menuitem = _createMenuItem(Zotero.getString("locate.manageLocateEngines"), "zotero-manage-locate-menu");
		menuitem.addEventListener("command", _openLocateEngineManager, false);
		locateMenu.appendChild(menuitem);
	}
	
	/**
	 * Clear the bottom part of the context menu and add locate options
	 * @param {menupopup} menu The menu to add context menu items to
	 */
	this.buildContextMenu = function(menu) {
		// remove old menu items
		while(menu.lastChild && menu.lastChild.getAttribute("zotero-locate")) {
			menu.removeChild(menu.lastChild);
		}
		
		// get selected items
		var selectedItems = [item for each(item in ZoteroPane.getSelectedItems()) if(!item.isNote())];
		
		// if no items selected, stop now
		if(!selectedItems.length) return;
		
		// add view options
		_addViewOptions(menu, selectedItems, false, true);
		
		/*// look for locate engines
		var availableEngines = _getAvailableLocateEngines(selectedItems);
		if(availableEngines.length) {
			// if locate engines are available, make a new submenu
			var submenu = document.createElement("menu");
			submenu.setAttribute("zotero-locate", "true");
			submenu.setAttribute("label", Zotero.getString("locate.locateEngines"));
			
			// add locate engines to the submenu
			_addLocateEngines(submenuPopup, availableEngines, true);
			
			submenu.appendChild(submenuPopup);
			menu.appendChild(submenu);
		}*/
	}
	
	/**
	 * Add view options to a menu
	 * @param {menupopup} locateMenu The menu to add menu items to
	 * @param {Zotero.Item[]} selectedItems The items to create view options based upon
	 * @param {Boolean} showIcons Whether menu items should have associated icons
	 * @param {Boolean} addSeparator Whether a separator should be added before any menu items
	 */
	function _addViewOptions(locateMenu, selectedItems, showIcons, addSeparator) {
		var optionsToShow = {};
		var haveItems = false;
		
		// check which view options are available
		for each(var item in selectedItems) {
			for(var viewOption in ViewOptions) {
				if(!optionsToShow[viewOption]) {
					optionsToShow[viewOption] = ViewOptions[viewOption].canHandleItem(item);
					haveItems = true;
				}
			}
		}
		
		if(haveItems && addSeparator) {		
			var sep = document.createElement("menuseparator");
			sep.setAttribute("zotero-locate", "true");
			locateMenu.appendChild(sep);
		}
		
		// add available view options to menu
		for(var viewOption in optionsToShow) {
			if(!optionsToShow[viewOption]) continue;
			
			var menuitem = _createMenuItem(Zotero.getString("locate."+viewOption+".label"),
				null, Zotero.getString("locate."+viewOption+".tooltip"));
			if(showIcons) {
				menuitem.setAttribute("class", "menuitem-iconic");
				menuitem.setAttribute("image", ViewOptions[viewOption].icon);
			}
			menuitem.setAttribute("zotero-locate", "true");
			locateMenu.appendChild(menuitem);
			
			let myViewOption = viewOption;
			menuitem.addEventListener("command", function(event) {
				ViewOptions[myViewOption].handleItems(selectedItems, event);
			}, false)
		}
	}
	
	/**
	 * Get available locate engines that can handle a set of items 
	 * @param {Zotero.Item[]} selectedItems The items to look or locate engines for
	 * @return {Zotero.LocateManater.LocateEngine[]} An array of locate engines capable of handling
	 *	the given items
	 */
	function _getAvailableLocateEngines(selectedItems) {
		// check for custom locate engines
		var customEngines = Zotero.LocateManager.getVisibleEngines();
		var availableEngines = [];
		
		// check which engines can translate an item
		for each(var engine in customEngines) {
			// require a submission for at least one selected item
			for each(var item in selectedItems) {
				if(engine.getItemSubmission(item)) {
					availableEngines.push(engine);
					break;
				}
			}
		}
		
		return availableEngines;
	}
	
	/**
	 * Add locate engine options to a menu
	 * @param {menupopup} menu The menu to add menu items to
	 * @param {Zotero.LocateManater.LocateEngine[]} engines The list of engines to add to the menu
	 * @param {Boolean} showIcons Whether menu items should have associated icons
	 */
	function _addLocateEngines(menu, engines, showIcons) {
		for each(var engine in engines) {
			var menuitem = _createMenuItem(engine.name, null, engine.description);
			menuitem.setAttribute("class", "menuitem-iconic");
			menuitem.setAttribute("image", engine.icon);
			menu.appendChild(menuitem);
			menuitem.addEventListener("command", _locateItem, false);
		}
	}
	
	/**
	 * Create a new menuitem XUL element
	 */
	function _createMenuItem( label, id, tooltiptext ) {
		var menuitem = document.createElement("menuitem");
		menuitem.setAttribute("label", label);
		if(id) menuitem.setAttribute("id", id);
		if(tooltiptext) menuitem.setAttribute("tooltiptext", tooltiptext);
		
		return menuitem;
	}
	
	/**
	 * Get any locate engines that can be installed from the current page
	 */
	function _getInstallableLocateEngines() {
		var locateEngines = [];
		if(!window.Zotero_Browser || !window.Zotero_Browser.tabbrowser) return locateEngines;
		
		var links = Zotero_Browser.tabbrowser.selectedBrowser.contentDocument.getElementsByTagName("link");
		for each(var link in links) {
			if(!link.getAttribute) continue;
			var rel = link.getAttribute("rel");
			if(rel && rel === "search") {
				var type = link.getAttribute("type");
				if(type && type === "application/x-openurl-opensearchdescription+xml") {
					var label = link.getAttribute("title");
					if(label) {
						if(Zotero.LocateManager.getEngineByName(label)) {
							label = 'Update "'+label+'"';
						} else {
							label = 'Add "'+label+'"';
						}
					} else {
						label = 'Add Locate Engine';
					}
					
					locateEngines.push({'label':label,
						'href':link.getAttribute("href"),
						'image':Zotero_Browser.tabbrowser.selectedTab.image});
				}
			}
		}
		
		return locateEngines;
	}
	
	/**
	 * Locate selected items
	 */
	function _locateItem(event) {
		var selectedItems = ZoteroPane.getSelectedItems();
		
		// find selected engine
		var selectedEngine = Zotero.LocateManager.getEngineByName(event.target.label);
		if(!selectedEngine) throw "Selected locate engine not found";
		
		var urls = [];
		var postDatas = [];
		for each(var item in selectedItems) {
			var submission = selectedEngine.getItemSubmission(item);
			if(submission) {
				urls.push(submission.uri.spec);
				postDatas.push(submission.postData);
			}
		}
		
		Zotero.debug("Loading using "+selectedEngine.name);
		Zotero.debug(urls);
		ZoteroPane.loadURI(urls, event, postDatas);
	}
	
  	/**
  	 * Add a new locate engine
  	 */
	function _addLocateEngine(event) {
		Zotero.LocateManager.addEngine(event.target.zoteroLocateInfo.href,
			Components.interfaces.nsISearchEngine.TYPE_OPENSEARCH,
			event.target.zoteroLocateInfo.image, false);
	}
	
  	/**
  	 * Open the locate manager
  	 */
	function _openLocateEngineManager(event) {
		window.openDialog('chrome://zotero/content/locateManager.xul',
			'Zotero Locate Engine Manager',
			'chrome,centerscreen'
		);
	}
	
	var ViewOptions = {};
	
	/**
	 * "View PDF" option
	 *
	 * Should appear only when the item is a PDF, or a linked or attached file or web attachment is
	 * a PDF
	 */
	ViewOptions.pdf = new function() {
		this.icon = "chrome://zotero/skin/treeitem-attachment-pdf.png";
		this._mimeTypes = ["application/pdf"];
		this.canHandleItem = function(item) !!_getFirstAttachmentWithMIMEType(item, this._mimeTypes);
		
		this.handleItems = function(items, event) {
			for each(var item in items) {
				var attachment = _getFirstAttachmentWithMIMEType(item, this._mimeTypes);
				if(attachment) {
					ZoteroPane.viewAttachment(attachment.id, event);
					return;
				}
			}
		}
		
		function _getFirstAttachmentWithMIMEType(item, mimeTypes) {
			var attachments = (item.isAttachment() ? [item] : Zotero.Items.get(item.getBestAttachments()));
			for each(var attachment in attachments) {
				if(mimeTypes.indexOf(attachment.attachmentMIMEType) !== -1
					&& item.linkMode != Zotero.Attachments.LINK_MODE_LINKED_URL) return attachment;
			}
			return false;
		}
	};
	
	/**
	 * "View Online" option
	 *
	 * Should appear only when an item or an attachment has a URL
	 */
	ViewOptions.online = new function() {
		this.icon = "chrome://zotero/skin/locate-view-online.png";
		this.canHandleItem = function(item) _getURL(item) !== false;
		
		this.handleItems = function(items, event) {
			var urls = [_getURL(item) for each(item in items)];
			ZoteroPane.loadURI([url for each(url in urls) if(url)], event);
		}
		
		function _getURL(item) {
			// try url field for item and for attachments
			var urlField = item.getField('url');
			if(urlField) {
				var uri = Zotero_LocateMenu.ios.newURI(urlField, null, null);
				if(uri && uri.host && uri.scheme !== 'file') return urlField;
			}
			
			if(item.isRegularItem()) {
				var attachments = item.getAttachments();
				if(attachments) {
					// look through url fields for non-file:/// attachments
					for each(var attachment in Zotero.Items.get(attachments)) {
						var urlField = attachment.getField('url');
						if(urlField) return urlField;
					}
					
				}
			}
			
			// if no url field, try DOI field
			var doi = item.getField('DOI');
			if(doi && typeof doi === "string") {
				doi = Zotero.Utilities.cleanDOI(doi);
				if(doi) {
					return "http://dx.doi.org/" + encodeURIComponent(doi);
				}
			}
			
			return false;
		}
	};
	
	/**
	 * "View Snapshot" option
	 *
	 * Should appear only when the item is a PDF, or a linked or attached file or web attachment is
	 * a snapshot
	 */
	ViewOptions.snapshot = new function() {
		this.icon = "chrome://zotero/skin/treeitem-attachment-snapshot.png";
		this._mimeTypes = ["text/html", "application/xhtml+xml"];
		this.canHandleItem = ViewOptions.pdf.canHandleItem;
		this.handleItems = ViewOptions.pdf.handleItems;
	};
	
	/**
	 * "View File" option
	 *
	 * Should appear only when an item or a linked or attached file or web attachment does not
	 * satisfy the conditions for "View PDF" or "View Snapshot"
	 */
	ViewOptions.file = new function() {
		this.icon = "chrome://zotero/skin/treeitem-attachment-file.png";
		this.canHandleItem = function(item) !!_getFile(item);
		
		this.handleItems = function(items, event) {
			for each(var item in items) {
				var attachment = _getFile(item);
				if(attachment) {
					ZoteroPane.viewAttachment(attachment.id, event);
					return;
				}
			}
		}
		
		function _getFile(item) {
			var attachments = (item.isAttachment() ? [item] : Zotero.Items.get(item.getBestAttachments()));
			for each(var attachment in attachments) {
				if(!ViewOptions.snapshot.canHandleItem(attachment)
						&& !ViewOptions.pdf.canHandleItem(attachment)
						&& item.linkMode != Zotero.Attachments.LINK_MODE_LINKED_URL) {
					return attachment;
				}
			}
			return false;
		}
	};
	
	/**
	 * "Open in External Viewer" option
	 *
	 * Should appear only when an item or a linked or attached file or web attachment can be 
	 * viewed by an internal non-native handler and "launchNonNativeFiles" pref is disabled
	 */
	ViewOptions.externalViewer = new function() {
		this.icon = "chrome://zotero/skin/locate-external-viewer.png";
		this.useExternalViewer = true;
		
		this.canHandleItem = function(item) {
			return (this.useExternalViewer ^ Zotero.Prefs.get('launchNonNativeFiles'))
				&& _getBestNonNativeAttachment(item);
		}
		
		this.handleItems = function(items, event) {
			for each(var item in items) {
				var attachment = _getBestNonNativeAttachment(item);
				if(attachment) {
					ZoteroPane.viewAttachment(attachment.id, event, false, this.useExternalViewer);
					return;
				}
			}
		}
		
		function _getBestNonNativeAttachment(item) {
			var attachments = (item.isAttachment() ? [item] : Zotero.Items.get(item.getBestAttachments()));
			for each(var attachment in attachments) {
				if(attachment.linkMode != Zotero.Attachments.LINK_MODE_LINKED_URL) {
					var file = attachment.getFile();
					if(file) {
						var ext = Zotero.File.getExtension(file);
						if(!attachment.attachmentMIMEType) continue;
						if(!Zotero.MIME.hasNativeHandler(attachment.attachmentMIMEType, ext) &&
								Zotero.MIME.hasInternalHandler(attachment.attachmentMIMEType, ext)) {
							return attachment;
						}
					}
				}
			}
			return false;
		}
	};
	
	/**
	 * "Open in Internal Viewer" option
	 *
	 * Should appear only when an item or a linked or attached file or web attachment can be 
	 * viewed by an internal non-native handler and "launchNonNativeFiles" pref is enabled
	 */
	ViewOptions.internalViewer = new function() {
		this.icon = "chrome://zotero/skin/locate-internal-viewer.png";
		this.useExternalViewer = false;
		this.canHandleItem = ViewOptions.externalViewer.canHandleItem;
		this.handleItems = ViewOptions.externalViewer.handleItems;
	};
	
	/**
	 * "Show File" option
	 *
	 * Should appear only when an item is a file or web attachment, or has a linked or attached
	 * file or web attachment
	 */
	ViewOptions.showFile = new function() {
		this.icon = "chrome://zotero/skin/locate-show-file.png";
		this.useExternalViewer = true;
		
		this.canHandleItem = function(item) {
			return !!_getBestFile(item);
		}
		
		this.handleItems = function(items, event) {
			for each(var item in items) {
				var attachment = _getBestFile(item);
				if(attachment) {
					ZoteroPane.showAttachmentInFilesystem(attachment.id);
					return;
				}
			}
		}
		
		function _getBestFile(item) {
			if(item.isAttachment()) {
				if(item.linkMode === Zotero.Attachments.LINK_MODE_LINKED_URL) return false
				return item;
			} else {
				return Zotero.Items.get(item.getBestAttachment());
			}
		}
	};
	
	/**
	 * "Library Lookup" Option
	 *
	 * Should appear only for regular items
	 */
	ViewOptions.libraryLookup = new function() {
		this.icon = "chrome://zotero/skin/locate-library-lookup.png";
		this.canHandleItem = function(item) item.isRegularItem();
		this.handleItems = function(items, event) {
			var urls = [];
			for each(var item in items) {
				if(!item.isRegularItem()) continue;
				var url = Zotero.OpenURL.resolve(item);
				if(url) urls.push(url);
			}
			ZoteroPane.loadURI(urls, event);
		}
	};
}