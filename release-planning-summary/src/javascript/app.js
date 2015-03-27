Ext.define("ReleasePlanningSummary", {
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
        container.add(
        {
            xtype:'rallyreleasecombobox',
            listeners: {
                scope: this,
                change: function(rb, new_value, old_value) {
                    var feature_filter = rb.getQueryFromSelected();
                    var me = this;
                    
                    this.setLoading("Loading Features and Stories");
                    
                    var story_filter = [
                        {property:'Feature.Release.Name',value:rb.getRecord().get('Name')},
                        {property:'DirectChildrenCount',value:0}
                    ];
                    
                    Deft.Promise.all([
                        this._getFeatureStore(feature_filter),
                        this._getStories(story_filter)
                    ]).then({
                        scope: this,
                        success: function(results) {
                            var feature_store = results[0];
                            var stories = results[1];
                            this.grid_store = feature_store;
                            this.setLoading(false);
                            
                            this._displayGrid(this.grid_store,stories);
                        },
                        failure: function(error_message){
                            alert(error_message);
                        }
                    }).always(function() {
                        me.setLoading(false);
                    });
                }
            }
        },
        {
            xtype:'component',
            flex: 1
        },
        {
            xtype:'rallybutton',
            itemId: 'csv_button',
            text: 'Export',
            disabled: true,
            listeners: {
                scope: this,
                click: this._exportToCSV
            }
        }
        );
    },
    
    _getStories: function(filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;

        this.logger.log("getting stories:",filters);
          
        Ext.create('Rally.data.wsapi.Store', {
            limit:'Infinity',
            model: 'HierarchicalRequirement',
            fetch: ['FormattedID','Feature','ScheduleState','PlanEstimate','Iteration','Release',
                'Name', 'StartDate', 'EndDate','Project','c_RequestedRelease','ReleaseDate'],
            filters: filters
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
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
        var model_name = 'PortfolioItem/Feature',
            field_names = ['FormattedID','Name','Release','UserStories',
                'UnEstimatedLeafStoryCount','LeafStoryPlanEstimateTotal',
                'c_RequestedRelease'];
                        
        this.logger.log("Starting load:",filters);
          
        Ext.create('Rally.data.wsapi.Store', {
            model: model_name,
            fetch: field_names,
            pageSize: 25,
            filters: filters
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(this);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    _displayGrid: function(store,stories){
        var me = this;

        this.down('#display_box').removeAll();
        this.logger.log("Grid:", store, stories);
        
        var stories_by_feature = this._getStoriesByFeature(stories);
        
        this._calculate(store.getRecords(), stories_by_feature);
        
        store.on('load',function(store,records) {
            this._calculate(records,stories_by_feature);
        }, this);
        
        this.columns = [
            {dataIndex: 'FormattedID', text:'id',_csvIgnoreRender: true},
            {dataIndex: "Name", text: "Name",_csvIgnoreRender: true },
            {dataIndex: "c_RequestedRelease", text: "Requested Release"},
            {dataIndex: "Release", text: "Release"},
            {dataIndex: "UserStories", text: "Story Count", align: "right", renderer: function(value,meta_data,record){
                
                if ( !value ) {
                    return 0;
                }
                return value.Count;
            } },
            { dataIndex: "UnEstimatedLeafStoryCount", text: "Unestimated Stories", align: "right"},
            { 
                dataIndex: "LeafStoryPlanEstimateTotal", 
                text: "Total Points",
                renderer: function(value,meta_data,record) {
                    return Ext.util.Format.number(value,'0');
                }
            },
            { text: "Completed Points", align: "right", renderer: function(value,meta_data,record){
                
                if ( !record.get('_stories_done') ) {
                    return "N/A";
                }
                
                var points = 0;
                Ext.Array.each( record.get('_stories_done'), function(story) {
                    var record_points = story.get('PlanEstimate') || 0;
                    points = points + record_points;
                });
                                
                return points;
            }},
            { text: "Remaining Points", align: "right", renderer: function(value,meta_data,record){
                if ( !record.get('_stories_not_done') ) {
                    return "N/A";
                }
                var points = 0;
                Ext.Array.each( record.get('_stories_not_done'), function(story) {
                    var record_points = story.get('PlanEstimate') || 0;
                    points = points + record_points;
                });
                
                return points;
            }},
            { text: "Planned Points", align: "right", renderer: function(value,meta_data,record){
                if ( !record.get('_stories_not_done') ) {
                    return "N/A";
                }
                var points = 0;
                Ext.Array.each( record.get('_stories_not_done'), function(story) {
                    
                    var record_points = story.get('PlanEstimate') || 0;
                    var iteration = story.get('Iteration');
                    var today_iso = Rally.util.DateTime.toIsoString(new Date());
                    var release_end = story.get('Feature').Release.ReleaseDate;
                    
                    me.logger.log(release_end);
                    
                    if ( iteration ) {
                        me.logger.log('compare ',iteration.EndDate,' <=? ',release_end , story.get('FormattedID'));
                        me.logger.log(' and ', iteration.StartDate, ' >? ', today_iso );
                    }
                    
                    if ( iteration && iteration.StartDate > today_iso && iteration.EndDate <= release_end ) {
                        me.logger.log('--');
                        points = points + record_points;
                    }
                });
                
                return points;
            }},
            { text: "Unplanned Points", align: "right", renderer: function(value,meta_data,record){
                if ( !record.get('_stories_not_done') ) {
                    return "N/A";
                }
                var points = 0;
                Ext.Array.each( record.get('_stories_not_done'), function(story) {
                    var record_points = story.get('PlanEstimate') || 0;
                    var iteration = story.get('Iteration');
                    var today_iso = Rally.util.DateTime.toIsoString(new Date());
                    var release_end = story.get('Feature').Release.ReleaseDate;

                    if ( ! iteration || iteration.StartDate < today_iso || iteration.EndDate > release_end) {
                        points = points + record_points;
                    }
                });
                
                return points;
            }}
        ]
        
        this.grid = this.down('#display_box').add({
            xtype: 'rallygrid',
            store: store,
            sortableColumns: false,
            showRowActionsColumn: false,
            columnCfgs: this.columns,
            listeners: {
                itemclick: function(view, record, item, index, evt) {
                    var column_index = view.getPositionByEvent(evt).column;
                    this.showDetailPopup(record, column_index);
                },
                scope : this
            }
        });
        
        this.down('#csv_button').setDisabled(false);
    },
    _getStoriesByFeature: function(stories) {
        var stories_by_feature = {};
        
        Ext.Array.each(stories,function(story){
            var feature = story.get('Feature').FormattedID;
            if ( !stories_by_feature[feature] ) {
                stories_by_feature[feature] = [];
            }
            stories_by_feature[feature].push(story);
        });
        return stories_by_feature;
    },
    
    _calculate: function(features,stories_by_feature){
        this.logger.log("features:",features);
        this.logger.log("stories:", stories_by_feature);
        Ext.Array.each(features, function(feature) {
            var stories = stories_by_feature[feature.get('FormattedID')];
            feature.set('_stories', stories);
            feature.set('_stories_done', this._getDoneStories(stories));
            feature.set('_stories_not_done', this._getNotDoneStories(stories));
            
        },this);
    },
    
    _getDoneStories: function(stories) {
        // stories that are accepted or completed
        var done_stories = [];
        var today_iso = Rally.util.DateTime.toIsoString(new Date());
        
        Ext.Array.each(stories, function(story) {
            var schedule_state = story.get('ScheduleState');
            var iteration = story.get('Iteration');
            
            if (( schedule_state == "Accepted" || schedule_state == "Completed" ) || ( iteration && iteration.StartDate < today_iso && iteration.EndDate > today_iso )  ) {
                done_stories.push(story);
            }
        });
        return done_stories;
    },
    
    _getNotDoneStories: function(stories) {
        // stories that are accepted or completed
        var not_done_stories = [];
        var today_iso = Rally.util.DateTime.toIsoString(new Date());
        Ext.Array.each(stories, function(story) {
            var schedule_state = story.get('ScheduleState');
            var iteration = story.get('Iteration');
            // first, is it in the current iteration?
            if ( iteration && iteration.StartDate < today_iso && iteration.EndDate > today_iso ) {
                // don't keep
            } else if (( schedule_state != "Accepted" && schedule_state != "Completed" )) {
                not_done_stories.push(story);
            }  
        });
        return not_done_stories;
    },
    
    showDetailPopup: function(record, column_index) {
        var me = this;
        if ( column_index ==  1 || column_index > 2 ) {
            var stories = record.get('_stories');
            var title = "Stories for " + record.get('Name');
            
            var store = Ext.create('Rally.data.custom.Store', {
                data: stories
            });
            
            Ext.create('Rally.ui.dialog.Dialog', {
                id        : 'detailPopup',
                title     : title,
                width     : Ext.getBody().getWidth() - 25,
                height    : Ext.getBody().getHeight() - 25,
                closable  : true,
                layout    : 'fit',
                items     : [{
                    xtype                : 'rallygrid',
                    sortableColumns      : true,
                    showRowActionsColumn : false,
                    showPagingToolbar    : false,
                    columnCfgs           : [
                        {
                            dataIndex : 'FormattedID',
                            text: "id"
                        },
                        {
                            dataIndex : 'Name',
                            text: "Name",
                            flex: 1
                        },
                        {
                            dataIndex : 'Iteration',
                            text: "Iteration",
                            renderer: function(value,meta_data,record){
                                if ( value && value.Name ) {
                                    return value.Name;
                                }
                                return "";
                            }
                        },
                        {
                            dataIndex: 'ScheduleState',
                            text: "Schedule State"
                        },
                        {
                            dataIndex: 'PlanEstimate',
                            text: 'Points'
                        },
                        {
                            dataIndex: 'Project',
                            text: 'Team',
                            flex: 1,
                            renderer: function(value,meta_data,record){
                                if ( value && value.Name ) {
                                    return value.Name;
                                }
                                return "";
                            }
                        }
                    ],
                    store : store
                }]
            }).show();
        }
    },
    
    _exportToCSV: function() {
        this.setLoading(true);
        Rally.technicalservices.FileUtilities.getCSVFromGrid(this.grid).then({
            scope: this,
            success: function(csv) {
                this.setLoading(false);
                Rally.technicalservices.FileUtilities.saveTextAsFile(csv, 'export.csv',{type:'text/csv;charset=utf-8'})
            }
        });
    }
    
});
