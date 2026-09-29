var tramiteOnlinesServices = angular.module('tramiteOnlineServices', ['app.services']);

tramiteOnlinesServices.factory('TramiteOnline', ['baseDataService',
    function (baseDataService) {
        return baseDataService.getService('api/tramiteOnline', false, {
            obtenerTipoTramite: { method: 'POST', url: 'api/tramiteOnline/obtenerTipoTramite' }
        });
    }]);