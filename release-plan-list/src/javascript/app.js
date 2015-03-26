Ext.define("ReleasePlanList", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    config: {
        defaultSettings: {
            timebox_selection: 'Release'
        }
    },
    items: [
        {xtype:'container',itemId:'selector_box',layout: { type: 'hbox'} },
        {xtype:'container', items: [
            {xtype:'container',itemId:'feature_box'},
            {xtype:'container',itemId:'story_box'}
        ]},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
         if (typeof(this.getAppId()) == 'undefined' ) {
            // not inside Rally
            this._showExternalSettingsDialog(this.getSettingsFields());
        } else {
            this._buildDisplay();
        }
    },
    _buildDisplay: function() {
        this._addSelectors(this.down('#selector_box'));
    },
    
    _addSelectors: function(container) {
        this.logger.log("Selector to use: ", this.getSetting('timebox_selection'));
        
        if ( this.getSetting('timebox_selection') == "RequestedRelease") {
            container.add({
                xtype: 'rallyfieldvaluecombobox',
                model: 'PortfolioItem',
                field: 'c_RequestedRelease',
                stateful: true,
                stateId: 'rally.technicalservices.featureplanning.requestedrelease',
                stateEvents: ['change'],
                listeners: {
                    scope: this,
                    change: function(cb) {
                        var me = this;
                        this.setLoading("Loading Features and Stories");
                        
                        var feature_filter = [
                            {property:'c_RequestedRelease',value:cb.getValue()}
                        ];
                        
                        var story_filter = [
                            {property:'Feature.c_RequestedRelease',value:cb.getValue()},
                            {property:'DirectChildrenCount',value:0}
                        ];
                        
                        this._getData(story_filter,feature_filter);
                    }
                }
            });
        } else {
            container.add({
                xtype: 'rallyreleasecombobox',
                stateful: true,
                stateId: 'rally.technicalservices.featureplanning.release',
                stateEvents: ['change'],
                listeners: {
                    scope: this,
                    change: function(cb) {
                        var me = this;
                        this.setLoading("Loading Features and Stories");
                        
                        var feature_filter = [
                            {property:'Release.Name',value:cb.getRecord().get('Name')}
                        ];
                        
                        var story_filter = [
                            {property:'Feature.Release.Name',value:cb.getRecord().get('Name')},
                            {property:'DirectChildrenCount',value:0}
                        ];
                        
                        this._getData(story_filter,feature_filter);
                    }
                }
            });
        }
    },
    
    _getData: function(story_filter,feature_filter) {
        var me = this;
        
        Deft.Chain.pipeline([
            function() { 
                return this._getStoryStore(story_filter);
            },
            function(story_store) {
                return this._getFeatureStore(feature_filter,story_store);
            }
        ],this).then({
            scope: this,
            success: function(results) {
                this.setLoading('Creating Grids');
                this._displayGrids(results[0],results[1]);
            },
            failure: function(error_message){
                alert(error_message);
            }
        }).always(function() {
            me.setLoading(false);
        });
    },
    
    _getStoryStore: function(filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;

        var field_names = [];
        
        Ext.Array.each(this._getStoryColumns(), function(column){
            if (column.dataIndex) {
                field_names.push(column.dataIndex);
            }
        });
        
        this.logger.log("getting stories:",filters);
          
        Ext.create('Rally.data.wsapi.Store', {
            model: 'HierarchicalRequirement',
            pageSize: 25,
            fetch: field_names,
            filters: filters,
            context: {
                project:null
            }
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(this);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem getting stories: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    _getFeatureStore: function(filters,story_store){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var model_name = 'PortfolioItem/Feature';
        this.logger.log('_getFeatureStore',filters,story_store);
        
        var field_names = [];
        
        Ext.Array.each(this._getFeatureColumns(), function(column){
            if (column.dataIndex) {
                field_names.push(column.dataIndex);
            }
        });
                  
        Ext.create('Rally.data.wsapi.Store', {
            model: model_name,
            fetch: field_names,
            pageSize: 25,
            filters: filters,
            sorters: [{ property:'DragAndDropRank', direction:'ASC'}]
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    me._performFeatureCalculations(story_store,records);                    
                    deferred.resolve([this,story_store]);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    _performFeatureCalculations: function(story_store,records){
        var me = this;
        this.logger.log("_performFeatureCalculations");
        
        var stories_by_feature = {};
        Ext.Array.each(story_store.getRecords(),function(story){
            var feature = story.get('Feature');
            if ( feature ) {
                var fid = feature.FormattedID;
                if ( !stories_by_feature[fid] ) {
                    stories_by_feature[fid] = [];
                }
                stories_by_feature[fid].push(story);
            }
        });
        
        var current_cumulative = 0;
        Ext.Array.each(records, function(record){
//            var current_plan_estimate = record.get('LeafStoryPlanEstimateTotal') || 0;
//            current_cumulative = current_cumulative + current_plan_estimate;
//            record.set('_cumulative', current_cumulative);
            
            var fid = record.get('FormattedID');
            record.set('_complete_by_count_percent', me._getCompletePercent(stories_by_feature[fid], 'count'));
            record.set('_complete_by_points_percent', me._getCompletePercent(stories_by_feature[fid], 'points'));
            record.set('_accepted_by_count_percent', me._getAcceptedPercent(stories_by_feature[fid], 'count'));
            record.set('_accepted_by_points_percent', me._getAcceptedPercent(stories_by_feature[fid], 'points'));
            
        });
    },
    _getCompletePercent: function(stories, metric) {
        if ( ! stories ) {
            return "N/A";
        }
        var complete = 0;
        var total = stories.length;
        
        if ( metric != 'count' ) {
            total = 0;
        }
        
        Ext.Array.each(stories,function(story){
            var added_value = 1;
            if ( metric != 'count' ) {
                added_value = story.get('PlanEstimate') || 0;
                total = total + added_value;
            }
            
            if ( story.get('ScheduleState') == 'Completed' || story.get('ScheduleState') == 'Accepted' ) {
                complete = complete + added_value;
            }
        });
        
        if ( total == 0 ) {
            return "n/a";
        }
        
        return Math.floor( 100*complete/total ) + "%";
        
    },
    
    _getAcceptedPercent: function(stories, metric) {
        if ( ! stories ) {
            return "N/A";
        }
        var complete = 0;
        var total = stories.length;
        
        if ( metric != 'count' ) {
            total = 0;
        }
        
        Ext.Array.each(stories,function(story){
            var added_value = 1;
            if ( metric != 'count' ) {
                added_value = story.get('PlanEstimate') || 0;
                total = total + added_value;
            }
            
            if ( story.get('ScheduleState') == 'Accepted' ) {
                complete = complete + added_value;
            }
        });
        
        if ( total == 0 ) {
            return "n/a";
        }
        
        return Math.floor( 100*complete/total ) + "%";
        
    },
    _displayGrids: function(feature_store, story_store){
        this.down('#feature_box').removeAll();
        this.down('#story_box').removeAll();
        feature_store.on('load', 
            function(store, features, successful) {
                if (successful){
                    this._performFeatureCalculations(story_store,features);
                } else {
                    this.logger.log("Failed: ", operation);
                }
            },
            this
        );
        
        this._displayGrid(this.down('#feature_box'),feature_store, this._getFeatureColumns());
        this._displayGrid(this.down('#story_box'),story_store, this._getStoryColumns());
    },
    
    _getFeatureColumns: function() {
        var columns = [
            {
                xtype: 'rallyfieldcolumn',
                text: '#',
                dataIndex: 'DragAndDropRank',
                draggable: false,
                resizable: false,
                width: 35,
                sortable: true
            },
            {dataIndex: 'FormattedID', text: 'id', _csvIgnoreRender: true  },
            {dataIndex: 'Name', text: 'Name' },
            {dataIndex: 'Release', text:'Release'},
            {dataIndex: 'c_MoSCoW', text: 'MoSCoW Priority' },
            
            {dataIndex: 'LeafStoryPlanEstimateTotal', text: 'Story Plan Estimate Total'},

            {dataIndex: 'LeafStoryCount', text: 'Story Count' },
            {dataIndex: 'UnEstimatedLeafStoryCount', text: 'Unestimated Story Count' },
            {dataIndex: 'Project', text: 'Project' },
            {dataIndex: 'Ready', text: 'Ready' , _csvIgnoreRender: true },
            {dataIndex: 'Owner', text:'Owner' },
            /* to save column positions/size, we have to have a dataIndex or an itemId */
            {itemId: '_complete_by_count', text: '% Complete by Count', renderer: function(value,meta_data,record) {
                return record.get('_complete_by_count_percent');
            }, align:'right'},
            {itemId: '_complete_by_points',text: '% Complete by Points', renderer: function(value,meta_data,record) {
                return record.get('_complete_by_points_percent');
            }, align:'right'},
            {itemId: '_accepted_by_count',text: '% Accepted by Count', renderer: function(value,meta_data,record) {
                return record.get('_accepted_by_count_percent');
            }, align:'right'},
            {itemId: '_accepted_by_count',text: '% Accepted by Points', renderer: function(value,meta_data,record) {
                return record.get('_accepted_by_points_percent');
            }, align:'right'}
        ]
        return columns;
    },
    
    _getStoryColumns: function() {
        var columns = [
            {dataIndex:'Feature', text: 'Feature ID', renderer: function(value,meta_data,index) {
                if ( !value ) {
                    return "";
                }
                
                return value.FormattedID;
            }},
            {dataIndex:'Feature', text: 'Feature Name', renderer: function(value,meta_data,index) {
                if ( !value ) {
                    return "";
                }
                
                return value.Name;
            }},
            {dataIndex: 'FormattedID', text: 'id', _csvIgnoreRender: true },
            {dataIndex: 'Name', text: 'Name' },
            {dataIndex: 'Release',text: 'Release'},
            {dataIndex: 'c_RequestedIteration',text: 'Requested Iteration'},
            {dataIndex: 'Iteration', text: 'Iteration' },
            {dataIndex: 'c_MoSCoW', text: 'MoSCoW Priority' },
            {dataIndex: 'Project', text: 'Project' },
            {dataIndex: 'PlanEstimate', text: 'Plan Estimate' },
            {dataIndex: 'ScheduleState', text: 'Schedule State', _csvIgnoreRender: true },
            {dataIndex: 'Owner', text: 'Owner' },
            {dataIndex: 'Predecessors', text: 'Predecessors' },
            {dataIndex: 'Successors', text: 'Successors' }
        ]
        
        return columns;
    },
    
    _displayGrid:function(container,store,columns) {
        this.logger.log("_displayGrid",container,store,columns);
        var me = this;
        var grid_id = container.itemId + "_grid";

        var selector_container = container.add({xtype:'container',layout: { type: 'hbox' }, margin: 10});

        var column_order = this.getSetting(grid_id + ".column_order");
        var column_sizes = this.getSetting(grid_id + ".column_sizes");
        
        this.logger.log("settings",this.getSettings());
        
        columns = this._alignOrderOfColumns(columns,column_order);
        columns = this._alignSizesOfColumns(columns,column_sizes);
        
        var grid = container.add({
            xtype: 'rallygrid',
            defaultSortToRank: true,
            enableRanking: true,
            showRowActionsColumn: false,
            store: store,
            itemId: grid_id,
            columnCfgs: columns,
            listeners: {
                /* can't use stateful/stateevents because of the special columns */
                columnresize: function(gridview) {
                    me._saveColumnSizes(this);
                },
                columnmove: function(gridview,column,fromIdx,toIdx) {
                    me._saveColumnPositions(this);
                }
            }
        });
        
                    
        selector_container.add({
            xtype:'component',
            flex: 1
        });
        
        selector_container.add({
            xtype:'rallybutton',
            text: 'Export',
            listeners: {
                scope: this,
                click: function() {
                    this._exportToCSV(grid);
                }
            }
        });
        
    },
    
    _alignOrderOfColumns: function(columns,column_order) {
        if ( !column_order ) {
            return columns;
        }
        
        if ( Ext.isString(column_order) ) {
            column_order = column_order.split(',');
        }
        
        var ordered_columns = [];
        var deferred_columns = [];
        
        Ext.Array.each(column_order, function(ordered_column_identifier) {
            Ext.Array.each(columns, function(column){
                var identifier = column.dataIndex || column.itemId;
                if ( identifier && identifier == ordered_column_identifier ) {
                    ordered_columns.push(column);
                }
            });
        });
        
        return ordered_columns;
        
    },
    
    _alignSizesOfColumns: function(columns,column_sizes) {
        if ( !column_sizes ) {
            return columns;
        }
        
        if ( Ext.isString(column_sizes) ) {
            column_sizes = Ext.JSON.decode(column_sizes);
        }
        
        if ( Ext.isObject(column_sizes) ) {
        
            Ext.Array.each(columns, function(column){
                var identifier = column.dataIndex || column.itemId;
                if ( identifier && column_sizes[identifier] ) {
                    column.width = column_sizes[identifier];
                }
            });
            
        }
        return columns;
    },
    
    _saveColumnPositions: function(grid) {
        var app = Rally.getApp();
        var columns = grid.headerCt.getGridColumns();
        
        var column_order = [];
        Ext.Array.each(columns, function(column){
            var identifier = column.dataIndex || column.itemId;
            if ( identifier ) {
                column_order.push(identifier);
            }
        });

        var settings = {};
        
        var app_id = app.getAppId();
        
        settings[grid.itemId + ".column_order"] = column_order;
                
        if ( app_id ) {
            app.updateSettingsValues({
                settings: settings
            });
        }
    },
    
    _saveColumnSizes: function(grid,column){
        var app = Rally.getApp();
        var columns = grid.headerCt.getGridColumns();
        
        var column_sizes = {};
        Ext.Array.each(columns, function(column){
            var identifier = column.dataIndex || column.itemId;
            if ( identifier && column.width ) {
                column_sizes[identifier] = column.width;
            }
        });

        var settings = {};
        
        var app_id = app.getAppId();
        
        settings[grid.itemId + ".column_sizes"] = Ext.JSON.encode(column_sizes);
                
        if ( app_id ) {
            app.updateSettingsValues({
                settings: settings
            });
        }
    },
    
    _exportToCSV: function(grid) {
        this.setLoading(true);
        
        Rally.technicalservices.FileUtilities.getCSVFromGrid(grid).then({
            scope: this,
            success: function(csv) {
                this.setLoading(false);
                Rally.technicalservices.FileUtilities.saveTextAsFile(csv, 'export.csv',{type:'text/csv;charset=utf-8'})
            }
        });
    },
    
    getSettingsFields: function() {
        var selector_data = [{
            'name': 'Release',
            'value': 'Release'
        },{
            'name': 'Requested Release',
            'value': 'RequestedRelease'
        }];
        
        var selector_store = Ext.create('Rally.data.custom.Store',{ 
            autoLoad: true,
            data: selector_data
        });
        
        return [{
            name: 'timebox_selection',
            xtype: 'rallycombobox',
            fieldLabel: 'Select by',
            displayField: 'name',
            valueField: 'value',
            store: selector_store,
            labelWidth: 150,
            readyEvent: 'ready' //event fired to signify readiness
        }];
    },
    
    // ONLY FOR RUNNING EXTERNALLY
    _showExternalSettingsDialog: function(fields){
        var me = this;
        if ( this.settings_dialog ) { this.settings_dialog.destroy(); }
        this.settings_dialog = Ext.create('Rally.ui.dialog.Dialog', {
             autoShow: false,
             draggable: true,
             width: 400,
             title: 'Settings',
             buttons: [{ 
                text: 'OK',
                handler: function(cmp){
                    var settings = {};
                    Ext.Array.each(fields,function(field){
                        settings[field.name] = cmp.up('rallydialog').down('[name="' + field.name + '"]').getValue();
                    });
                    me.settings = settings;
                    cmp.up('rallydialog').destroy();
                    me._buildDisplay();
                }
            }],
             items: [
                {xtype:'container',html: "&nbsp;", padding: 5, margin: 5},
                {xtype:'container',itemId:'field_box', padding: 5, margin: 5}]
         });
         Ext.Array.each(fields,function(field){
            me.settings_dialog.down('#field_box').add(field);
         });
         this.settings_dialog.show();
    },
    resizeIframe: function() {
        var iframeContentHeight = 400;    
        var container = window.frameElement.parentElement;
        if (container != parent.document.body) {
            container.style.height = iframeContentHeight + 'px';
        }
        window.frameElement.style.height = iframeContentHeight + 'px';
        return;
    }
    
});
