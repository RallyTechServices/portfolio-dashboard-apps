Ext.define("ReleasePlanList", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box',layout: { type: 'hbox'} },
        {xtype:'container', items: [
            {xtype:'container',itemId:'feature_box'},
            {xtype:'container',itemId:'story_box'}
        ]},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._addSelectors(this.down('#selector_box'));
    },
    
    _addSelectors: function(container) {
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
                }
            }
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
            limit:'Infinity',
            model: 'HierarchicalRequirement',
            pageSize: 25,
            fetch: field_names,
            filters: filters
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
            {dataIndex: 'FormattedID', text: 'id' },
            {dataIndex: 'Name', text: 'Name' },
            {dataIndex: 'Release', text:'Release'},
            {dataIndex: 'c_MoSCoW', text: 'MoSCoW Priority' },
            {dataIndex: 'LeafStoryPlanEstimateTotal', text: 'Story Plan Estimate Total'},
            
            {dataIndex: 'LeafStoryCount', text: 'Story Count' },
            {dataIndex: 'UnEstimatedLeafStoryCount', text: 'Unestimated Story Count' },
            {dataIndex: 'Project', text: 'Project' },
            {dataIndex: 'Ready', text: 'Ready' },
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
            {dataIndex: 'FormattedID', text: 'id' },
            {dataIndex: 'Name', text: 'Name' },
            {dataIndex: 'Release',text: 'Release'},
            {dataIndex: 'c_RequestedIteration',text: 'Requested Iteration'},
            {dataIndex: 'Iteration', text: 'Iteration' },
            {dataIndex: 'c_MoSCoW', text: 'MoSCoW Priority' },
            {dataIndex: 'Project', text: 'Project' },
            {dataIndex: 'PlanEstimate', text: 'Plan Estimate' },
            {dataIndex: 'ScheduleState', text: 'Schedule State' },
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
        var column_order = this.getSetting(grid_id + ".column_order");
        
        this.logger.log("saved column order:", grid_id + ".column_order", column_order);
        this.logger.log("--",this.getSettings());
        
        columns = this._alignOrderOfColumns(columns,column_order);
        
        container.add({
            xtype: 'rallygrid',
            defaultSortToRank: true,
            enableRanking: true,
            showRowActionsColumn: false,
            store: store,
            itemId: grid_id,
            columnCfgs: columns,
            listeners: {
                /* can't use stateful/stateevents because of the special columns */
                /*columnresize: this._saveColumnSizes,*/
                columnmove: function(gridview,column,fromIdx,toIdx) {
                    me._saveColumnPositions(this);
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

    _saveColumnPositions: function(grid,column,fromIdx,toIdx) {
        var app = Rally.getApp();
        
        app.logger.log("change column position", grid, column);
        app.logger.log(" header", grid.headerCt);
        var columns = grid.headerCt.getGridColumns();
        app.logger.log(" columns", columns);
        
        var column_order = [];
        Ext.Array.each(columns, function(column){
            var identifier = column.dataIndex || column.itemId;
            if ( identifier ) {
                column_order.push(identifier);
            }
        });
        app.logger.log("Saving column order:",column_order);
        var settings = {};
        
        var app_id = app.getAppId();
        
        settings[grid.itemId + ".column_order"] = column_order;
        
        app.logger.log("Setting: ", settings);
        
        if ( app_id ) {
            app.updateSettingsValues({
                settings: settings
            });
        }
    },
    
    _saveColumnSizes: function(container,column,width){
        this.logger.log("change column size", container, column, width);
        var settings = {};
        settings[column.itemId] = width;
        
        this.logger.log("Saving resize: ", settings);
        
//        this.updateSettingsValues({
//            settings: settings
//        });
    }
    
});
