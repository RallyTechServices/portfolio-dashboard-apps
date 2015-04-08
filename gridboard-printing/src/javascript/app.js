Ext.define('CustomApp', {
    extend: 'Rally.app.GridBoardApp',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    columnNames: ['Name','Owner','Iteration','PlanEstimate','c_MoSCoWPriority','Ready','c_PrimaryDevTeam','Project'],
    modelNames: ['PortfolioItem/Feature'],
    statePrefix: 'ts-pi-temp',
    gridStoreConfig: {
        fetch: ['Feature']
    },
    
    getGridBoardPlugins: function() {
        return  [
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
                        text: 'Print Selected Stories...',
                        handler: function() {
                            var gridorboard = this.down('rallygridboard').getGridOrBoard();
                            this._getSelectedStories( gridorboard ).then({
                                scope: this,
                                success: function(stories){
                                    this._openPrintCards(stories);
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
        ]
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
            context: { project: null },
            filters: [{ property:'PortfolioItem.ObjectID',value:selected_item.get('ObjectID')}],
            fetch:  ['c_MoSCoWPriority','Name','ObjectID','Feature', 'PlanEstimate',
                    'PortfolioItem','FormattedID','Project',
                    'Iteration','c_PrimaryDevTeam'],
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
            dataIndex: 'FormattedID',
            cls: 'cardUpperLeft'
        },
        {
            dataIndex: 'PlanEstimate',
            cls: 'cardUpperInnerRight',
            renderer: function(value,meta_data,record){
                if ( ! value ) { value = ""; }
                return value;
            }
        },
        {
            dataIndex: 'c_MoSCoWPriority',
            cls: 'cardUpperInnerLeft',
            renderer: function(value,meta_data,record){
                if ( ! value ) { value = ""; }
                return value;
            }
        },
        {
            dataIndex: 'Iteration',
            cls: 'cardUpperRight',
            renderer: function(value,meta_data,record){
                var iteration = record.get('Iteration');
                var iteration_name = " ";
                if ( iteration ) {
                    iteration_name = Ext.util.Format.substr(iteration.Name,0,4);
                }
                
                return iteration_name;
            }
        },
        {
            dataIndex: 'Project',
            cls: 'cardLowerLeft',
            renderer: function(value,meta_data,record){
                if ( !value ) {
                    return "";
                }
                
                var feature_string = record.get('Feature').FormattedID + ":  " + record.get('Feature').Name;
                //var project_string = record.get('Feature').c_PrimaryDevTeam;
                var project_string = record.get('Project').Name;
                var feature_project_string = record.get('Feature').Project.Name;
                
                return [feature_string,project_string,feature_project_string].join('<br/>');
            }
        },
        {
            dataIndex: 'Name',
            maxLength: 100,
            cls: 'cardTitle'
        }];
        
        var win = Ext.create('Rally.technicalservices.window.PrintCards',{
            records: records,
            displayFields: fields,
            currentDocument: Ext.getDoc()
        });
        win.show();
    },
    
    _getGridBoardContext: function () {
        return this.isWorkspaceScoped ? this.getContext().clone({ project: null }) : this.getContext();
    },
    
    _getTreeGridStore: function () {
        var me = this;
        
        return Ext.create('Rally.data.wsapi.TreeStoreBuilder').build(_.merge({
            autoLoad: false,
            childPageSizeEnabled: true,
            context: me._getGridBoardContext().getDataContext(),
            enableHierarchy: true,
            fetch: _.union(['Workspace','Feature','Ready'], me.columnNames),
            models: _.clone(me.models),
            pageSize: 25,
            remoteSort: true,
            root: {expanded: true}
        }, this.getGridStoreConfig())).then({
            success: function (treeGridStore) {
                treeGridStore.on('load', me.publishComponentReady, me, { single: true });
                return { gridStore: treeGridStore };
            },
            scope: me
        });
    }
});
