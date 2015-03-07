Ext.define("ReleasePlanList", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box',layout: { type: 'hbox'} },
        {xtype:'container',itemId:'display_box'},
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
            stateEvents: ['change','setvalue'],
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
                    
                    Deft.Promise.all([
                        this._getFeatureStore(feature_filter),
                        this._getStoryStore(story_filter)
                    ]).then({
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
    
    _getFeatureStore: function(filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var model_name = 'PortfolioItem/Feature';
        
        var field_names = [];
        
        Ext.Array.each(this._getFeatureColumns(), function(column){
            if (column.dataIndex) {
                field_names.push(column.dataIndex);
            }
        });
        
        this.logger.log("Starting load:",filters);
          
        Ext.create('Rally.data.wsapi.Store', {
            model: model_name,
            fetch: field_names,
            pageSize: 25,
            filters: filters,
            sorters: [{ property:'DragAndDropRank', direction:'ASC'}]
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    var current_cumulative = 0;
                    Ext.Array.each(records, function(record){
                        var current_plan_estimate = record.get('LeafStoryPlanEstimateTotal') || 0;
                        current_cumulative = current_cumulative + current_plan_estimate;
                        record.set('_cumulative', current_cumulative);
                    });
                    deferred.resolve(this);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    _displayGrids: function(feature_store, story_store){
        this.down('#display_box').removeAll();
        this._displayGrid(feature_store, this._getFeatureColumns());
        this._displayGrid(story_store, this._getStoryColumns());
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
            {dataIndex: 'LeafStoryPlanEstimateTotal', text: 'Story Plan Estimate Total'},
            { text: 'Cumulative', renderer: function(value,meta_data,record){
                var cumulative = record.get('_cumulative');
                if ( !cumulative ) {
                    return 0;
                }
                return cumulative;
            }, align: 'right' },
            {dataIndex: 'LeafStoryCount', text: 'Story Count' },
            {dataIndex: 'UnEstimatedLeafStoryCount', text: 'Unestimated Story Count' },
            {dataIndex: 'Project', text: 'Project' },
            {dataIndex: 'Ready', text: 'Ready' },
            {dataIndex: 'Owner', text:'Owner' },
            {dataIndex: 'PlannedStartDate', text: 'Planned Start' },
            {dataIndex: 'PlannedEndDate', text: 'Planned End' }
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
            {dataIndex: 'Iteration', text: 'Iteration' },
            {dataIndex: 'Project', text: 'Project' },
            {dataIndex: 'PlanEstimate', text: 'Plan Estimate' },
            {dataIndex: 'ScheduleState', text: 'Schedule State' },
            {dataIndex: 'Owner', text: 'Owner' },
            {dataIndex: 'Predecessors', text: 'Predecessors' },
            {dataIndex: 'Successors', text: 'Successors' }
        ]
        
        return columns;
    },
    
    _displayGrid:function(store,columns) {
        this.down('#display_box').add({
            xtype: 'rallygrid',
            defaultSortToRank: true,
            enableRanking: true,
            showRowActionsColumn: false,
            store: store,
            columnCfgs: columns
        });
    }
});