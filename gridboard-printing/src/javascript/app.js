Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        var models = ['portfolioitem/feature','userstory'];
        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: ['portfolioitem/feature'] ,
            autoLoad: true,
            enableHierarchy: true,
            
            _getStoreTypePaths: function() {
                return ['portfolioitem/feature','hierarchicalrequirement'];
            }
        }).then({
            scope: this,
            success: function(store) {
                this.down('#display_box').add({
                    xtype: 'tsgridboard',
                    context: this.getContext(),
                    modelNames: models,
                    toggleState: 'grid',
                    plugins: [
                        {
                            ptype: 'rallygridboardcustomfiltercontrol',
                            filterControlConfig: {
                                modelNames: ['portfolioitem/feature'],
                                stateful: true,
                                stateId: this.context.getScopedStateId('ts-printer-board')
                            },
                            showOwnerFilter: true,
                            ownerFilterControlConfig: {
                                stateful: true,
                                stateId: this.context.getScopedStateId('ts-printer-board')
                            }
                        },
                        {
                            ptype: 'rallygridboardactionsmenu',
                            menuItems: [
                                {
                                    text: 'Export...',
                                    handler: function() {
                                        window.location = Rally.ui.grid.GridCsvExport.buildCsvExportUrl(
                                            this.down('rallygridboard').getGridOrBoard());
                                    },
                                    scope: this
                                },
                                {
                                    text: 'Print Selected Stories...',
                                    handler: function() {
                                        var gridorboard = this.down('rallygridboard').getGridOrBoard();
                                        this._getSelectedStories( gridorboard ).then({
                                            scope: this,
                                            success: function(stories){
                                                this._openPrintCards(stories);
//                                                Ext.Array.each(stories,function(story){
//                                                    console.log(story.get('FormattedID'));
//                                                });
                                            },
                                            failure: function(msg) {
                                                alert(msg);
                                            }
                                        });
                                        
                                    },
                                    scope: this
                                }
                            ],
                            buttonConfig: {
                                iconCls: 'icon-export'
                            }
                        }
                    ],
                    cardBoardConfig: {
                        attribute: 'State'
                    },
                    gridConfig: {
                        store: store,
                        columnCfgs: [
                              'Name',
                              'State',
                              'Owner'
                        ]
                    },
                    height: this.getHeight()
                  });
              }
          });
    },
    _getSelectedStories: function( gridorboard ) {
        var deferred = Ext.create('Deft.Deferred');

        var selected_items = gridorboard.getSelModel().getSelection();
        
        var promises = [];
        var stories = [];
        
        Ext.Array.each(selected_items, function(selected_item){
            var type = selected_item.get('_type');
            if ( type == 'hierarchicalrequirement' ) {
                stories.push(selected_item);
            } else {
                promises.push(this._getChildItems(selected_item));
            }
        },this);
                
        if (promises.length > 0) {
        
            Deft.Promise.all(promises).then({
                scope: this,
                success: function(child_stories){
                    var fids_returned = [];
                    var stories_to_return = [];
                    
                    Ext.Array.each(stories,function(story){
                        fids_returned.push(story.get('FormattedID'));
                        stories_to_return.push(story);
                    });
                    
                    Ext.Array.each(Ext.Array.flatten(child_stories),function(story){
                        if ( Ext.Array.indexOf(fids_returned, story.get('FormattedID')) == -1 ) {
                            fids_returned.push(story.get('FormattedID'));
                            stories_to_return.push(story);
                        }
                    });
                    
                    deferred.resolve(stories_to_return);
                    
                },
                failure: function(msg) {
                    deferred.reject(msg);
                }
            });
            
        } else {
            deferred.resolve(stories);
        }
        return deferred.promise;
    },
    _getChildItems: function(selected_item){
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store', {
            model: 'hierarchicalrequirement',
            autoLoad: true,
            filters: [{ property:'PortfolioItem.ObjectID',value:selected_item.get('ObjectID')}],
            listeners: {
                load: function(store, records, successful) {
                    if (successful){
                        deferred.resolve(records);
                    } else {
                        deferred.reject('Failed to load children for ' + selected_item.get('FormattedID'));
                    }
                }
            }
        });
        return deferred.promise;
    },
    _openPrintCards: function(records){
        
        var fields =[{
            dataIndex: 'Name',
            maxLength: 100,
            cls: 'card-title'
        },{
            dataIndex: 'FormattedID',
            cls: 'card-id'
        }];
        
        var win = Ext.create('Rally.technicalservices.window.PrintCards',{
            records: records,
            displayFields: fields,
            currentDocument: Ext.getDoc()
        });
        win.show();
    }
    
});
