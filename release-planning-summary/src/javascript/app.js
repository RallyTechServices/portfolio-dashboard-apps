Ext.define("ReleasePlanningSummary", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box'},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._addReleaseSelector(this.down('#selector_box'));
    },
    _addReleaseSelector: function(container) {
        container.add({
            xtype:'rallyreleasecombobox',
            listeners: {
                scope: this,
                change: function(rb, new_value, old_value) {
                    var feature_filter = rb.getQueryFromSelected();
                    var me = this;
                    
                    var story_filter = [{property:'PortfolioItem.Release.Name',value:rb.getRecord().get('Name')}];
                    
                    Deft.Promise.all([
                        this._getFeatureStore(feature_filter),
                        this._getStories(story_filter)
                    ]).then({
                        scope: this,
                        success: function(results) {
                            var feature_store = results[0];
                            var stories = results[1];
                            
                            this._displayGrid(feature_store,stories);
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
    
    _getStories: function(filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;

        this.logger.log("getting stories:",filters);
          
        Ext.create('Rally.data.wsapi.Store', {
            limit:'Infinity',
            model: 'HierarchicalRequirement',
            fetch: ['FormattedID','PortfolioItem','ScheduleState','PlanEstimate','Iteration',
                'Name', 'StartDate'],
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
                'UnEstimatedLeafStoryCount','LeafStoryPlanEstimateTotal'];
                        
        this.logger.log("Starting load:",filters);
          
        Ext.create('Rally.data.wsapi.Store', {
            model: model_name,
            fetch: field_names,
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
        this.down('#display_box').removeAll();
        this.logger.log("Grid:", store, stories);
        
        var stories_by_feature = this._getStoriesByFeature(stories);
        
        this._calculate(store.getRecords(), stories_by_feature);
        
        store.on('load',function(store,records) {
            this._calculate(records,stories_by_feature);
        }, this);
        
        var columns = [
            {dataIndex: 'FormattedID', text:'id'},
            {dataIndex: "Name", text: "Name" },
            {dataIndex: "Release", text: "Release" },
            {dataIndex: "UserStories", text: "Story Count", renderer: function(value,meta_data,record){
                if ( !value ) {
                    return 0;
                }
                return value.Count;
            } },
            { dataIndex: "UnEstimatedLeafStoryCount", text: "Unestimated Stories" },
            { dataIndex: "LeafStoryPlanEstimateTotal", text: "Total Points" },
            { text: "Completed Points", renderer: function(value,meta_data,record){
                if ( !record.get('_stories_done') ) {
                    return "N/A";
                }
                var points = 0;
                Ext.Array.each( record.get('_stories_done'), function(story) {
                    var record_points = story.get('PlanEstimate') || 0;
                    points = points + record_points;
                });
                
                meta_data.style = "text-align:right;"
                return points;
            }},
            { text: "Remaining Points", renderer: function(value,meta_data,record){
                if ( !record.get('_stories_not_done') ) {
                    return "N/A";
                }
                var points = 0;
                Ext.Array.each( record.get('_stories_not_done'), function(story) {
                    var record_points = story.get('PlanEstimate') || 0;
                    points = points + record_points;
                });
                
                meta_data.style = "text-align:right;"
                return points;
            }},
            { text: "Planned Points", renderer: function(value,meta_data,record){
                if ( !record.get('_stories_not_done') ) {
                    return "N/A";
                }
                var points = 0;
                Ext.Array.each( record.get('_stories_not_done'), function(story) {
                    var record_points = story.get('PlanEstimate') || 0;
                    var iteration = story.get('Iteration');
                    var today_iso = Rally.util.DateTime.toIsoString(new Date());
                                        
                    if ( iteration && iteration.StartDate > today_iso ) {
                        points = points + record_points;
                    }
                });
                
                meta_data.style = "text-align:right;"
                return points;
            }},
            { text: "Unplanned Points", renderer: function(value,meta_data,record){
                if ( !record.get('_stories_not_done') ) {
                    return "N/A";
                }
                var points = 0;
                Ext.Array.each( record.get('_stories_not_done'), function(story) {
                    var record_points = story.get('PlanEstimate') || 0;
                    var iteration = story.get('Iteration');
                    var today_iso = Rally.util.DateTime.toIsoString(new Date());
                                        
                    if ( ! iteration ) {
                        points = points + record_points;
                    }
                });
                
                meta_data.style = "text-align:right;"
                return points;
            }}
        ]
        
        this.down('#display_box').add({
            xtype: 'rallygrid',
            store: store,
            sortableColumns: false,
            showRowActionsColumn: false,
            columnCfgs: columns
        });
    },
    _getStoriesByFeature: function(stories) {
        var stories_by_feature = {};
        
        Ext.Array.each(stories,function(story){
            var feature = story.get('PortfolioItem').FormattedID;
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
        Ext.Array.each(stories, function(story) {
            var schedule_state = story.get('ScheduleState');
            if ( schedule_state == "Accepted" || schedule_state == "Completed" ) {
                done_stories.push(story);
            }
        });
        return done_stories;
    },
    
    _getNotDoneStories: function(stories) {
        // stories that are accepted or completed
        var not_done_stories = [];
        Ext.Array.each(stories, function(story) {
            var schedule_state = story.get('ScheduleState');
            if ( schedule_state != "Accepted" && schedule_state != "Completed" ) {
                not_done_stories.push(story);
            }
        });
        return not_done_stories;
    }
});
