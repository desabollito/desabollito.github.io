var colegiosEscribanosServices = angular.module('escribanosServices', ['app.services']);

colegiosEscribanosServices.factory('escribanos', ['baseDataService',
    function (baseDataService) {
        return baseDataService.getService('api/escribanos', false, {
            colegios: { method: 'GET', url: 'api/escribanos/colegios', isArray: true }
        });
    }]);